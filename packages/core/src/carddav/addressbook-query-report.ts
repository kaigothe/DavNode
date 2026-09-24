import {
  hasAddressbookPrivilege,
  selectAddressObjectsWithPrivilege,
} from '../acl/evaluate-privilege.js';
import { AddressObject } from '../entities/address-object.entity.js';
import type { AddressbookCollection } from '../entities/addressbook-collection.entity.js';
import type {
  ReportContext,
  ReportHandler,
  ReportResult,
} from '../webdav/report-registry.js';
import {
  buildMultistatusResponse,
  type MultistatusResourceResult,
} from '../webdav/xml/multistatus-builder.js';
import {
  buildFilterCondition,
  findUnsupportedFilterParts,
  unsupportedFilterResult,
} from './addressbook-query-filter.js';
import {
  parseAddressbookQueryRequestBody,
  type AddressbookQueryRequestBody,
} from './addressbook-query-request.js';
import {
  buildAddressObjectResponses,
  checkSupportedAddressData,
  resolveReportAddressbook,
  toAddressbookUrl,
} from './addressbook-report-support.js';

/**
 * The most contacts one `addressbook-query` response carries, whatever
 * the client's `<C:limit>` says (RFC 6352 §8.6.2: a server "MAY limit the
 * number of resources in a response"). Bounds the work and the size of a
 * single response; a larger result set is truncated with a `507`.
 */
export const MAX_QUERY_RESULTS = 5000;

/** Most rows one database round trip fetches while collecting readable matches. */
const PAGE_SIZE = 500;

/**
 * Handles the `{CARDDAV:}addressbook-query` REPORT (RFC 6352 §8.6): the
 * contacts of one addressbook matching a `<C:filter>` of vCard
 * property conditions, answered as a `207 Multi-Status` with the
 * requested properties — the same selection logic as
 * `addressbook-multiget` (`buildAddressObjectResponses`).
 *
 * **Filtering never touches the vCard blobs**: the conditions become SQL
 * over `address_object_indexes` (`buildFilterCondition`); the blob
 * (`AddressObjectContent`) is loaded only afterwards, and only for the
 * matches actually returned, when `CARDDAV:address-data` is requested.
 * Consequently only the indexed properties (`INDEXED_PROPERTY_NAMES`)
 * can be filtered on: a `prop-filter` on any other property, and every
 * `param-filter`, is refused with `403` and the
 * `CARDDAV:supported-filter` precondition (naming what it can't
 * evaluate) rather than answered wrongly; a collation other than
 * `i;unicode-casemap`/`i;ascii-casemap` gets `CARDDAV:supported-collation`.
 * A `<C:filter>` with no `prop-filter` matches every contact.
 *
 * **Scope (`Depth`)**: the request must name an addressbook
 * (`/dav/{tenant}/addressbooks/{userId}/{addressbookName}`, else `404`).
 * `Depth: 1` and `infinity` search its contacts (addressbooks don't
 * nest, so they're the same); `Depth: 0` is the addressbook alone, which
 * holds no address object, hence an empty `207`. RFC 6352 §8.6 says the
 * header MUST be sent; a missing one gets RFC 3253 §3.6's default of `0`
 * rather than a guess, and any other value is `400`.
 *
 * **Authorization**: as `addressbook-multiget` — `read` on the
 * addressbook gates the request (`403`), and a contact the requester
 * can't `read` (its own ACEs can deny what the addressbook grants) is
 * simply not a match. That filtering happens *before* truncation, so
 * hidden contacts never use up result slots.
 *
 * **Limits and truncation** (RFC 6352 §8.6.1–8.6.2): the result is
 * capped at `min(<C:nresults>, MAX_QUERY_RESULTS)`. If more contacts
 * match, the response is still `207` with the first ones — ordered by
 * contact name, so truncation is stable — preceded by one response with
 * status `507` and `DAV:number-of-matches-within-limits` for the
 * Request-URI; that response doesn't count towards the limit.
 *
 * **Matching semantics**: see `buildFilterCondition`.
 */
export class AddressbookQueryReportHandler implements ReportHandler {
  /**
   * @param maxResults - The server-side result cap; defaults to
   * {@link MAX_QUERY_RESULTS}. Configurable so tests can exercise the cap
   * without inserting thousands of contacts.
   */
  constructor(private readonly maxResults: number = MAX_QUERY_RESULTS) {}

  /** See {@link ReportHandler.handle}. */
  async handle(
    requestXml: string,
    context: ReportContext,
  ): Promise<ReportResult> {
    const addressbook = await resolveReportAddressbook(context);
    if (!addressbook) {
      return { status: 404, body: '' };
    }
    if (
      !(await hasAddressbookPrivilege(
        context.manager,
        context.principal,
        addressbook,
        'read',
      ))
    ) {
      return { status: 403, body: '' };
    }

    let request: AddressbookQueryRequestBody;
    try {
      request = parseAddressbookQueryRequestBody(requestXml);
    } catch {
      return { status: 400, body: '' };
    }

    const depth = context.depth?.trim().toLowerCase() ?? '0';
    if (depth !== '0' && depth !== '1' && depth !== 'infinity') {
      return { status: 400, body: '' };
    }

    const unsupportedAddressData = checkSupportedAddressData(request.selection);
    if (unsupportedAddressData) {
      return unsupportedAddressData;
    }
    const unsupportedFilter = unsupportedFilterResult(
      findUnsupportedFilterParts(request.filter),
    );
    if (unsupportedFilter) {
      return unsupportedFilter;
    }

    const limit = Math.min(request.limit ?? this.maxResults, this.maxResults);
    const matches =
      depth === '0'
        ? []
        : await this.findReadableMatches(
            request,
            context,
            addressbook,
            limit + 1,
          );

    const truncated = matches.length > limit;
    const responses: MultistatusResourceResult[] = [];
    if (truncated) {
      responses.push({
        href: toAddressbookUrl(addressbook, context.tenant),
        properties: [],
        status: 507,
        error: ['number-of-matches-within-limits'],
      });
    }
    responses.push(
      ...(await buildAddressObjectResponses(
        context,
        addressbook,
        matches.slice(0, limit),
        request.selection,
      )),
    );
    return { status: 207, body: buildMultistatusResponse(responses) };
  }

  /**
   * The first `count` contacts, ordered by name, that match the filter
   * *and* the requester may read. Pages through the (index-evaluated)
   * matches, checking read access page by page, so a request for a few
   * results never checks the whole addressbook — while contacts hidden by
   * their own ACEs are skipped rather than counted.
   */
  private async findReadableMatches(
    request: AddressbookQueryRequestBody,
    context: ReportContext,
    addressbook: AddressbookCollection,
    count: number,
  ): Promise<AddressObject[]> {
    const query = context.manager
      .getRepository(AddressObject)
      .createQueryBuilder('ao')
      .where('ao.addressbookId = :addressbookId', {
        addressbookId: addressbook.id,
      });
    const condition = buildFilterCondition(
      context.manager,
      request.filter,
      'ao',
    );
    if (condition) {
      query.andWhere(condition.sql, condition.parameters);
    }
    query.orderBy('ao.name', 'ASC').addOrderBy('ao.id', 'ASC');

    const readable: AddressObject[] = [];
    let offset = 0;
    while (readable.length < count) {
      const pageSize = Math.min(PAGE_SIZE, count - readable.length);
      const page = await query.clone().offset(offset).limit(pageSize).getMany();
      offset += page.length;

      const allowed = await selectAddressObjectsWithPrivilege(
        context.manager,
        context.principal,
        addressbook,
        page,
        'read',
      );
      readable.push(...page.filter((contact) => allowed.has(contact.id)));

      if (page.length < pageSize) {
        break;
      }
    }
    return readable;
  }
}
