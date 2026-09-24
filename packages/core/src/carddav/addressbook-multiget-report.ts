import { In, type EntityManager } from 'typeorm';
import { create } from 'xmlbuilder2';
import {
  hasAddressbookPrivilege,
  selectAddressObjectsWithPrivilege,
} from '../acl/evaluate-privilege.js';
import { AddressObject } from '../entities/address-object.entity.js';
import type {
  ReportContext,
  ReportHandler,
  ReportResult,
} from '../webdav/report-registry.js';
import {
  buildMultistatusResponse,
  type MultistatusResourceResult,
} from '../webdav/xml/multistatus-builder.js';
import { asElement, type XmlNode } from '../webdav/xml/xml-value.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import {
  parseReportPropertySelection,
  type ReportPropertySelection,
} from './addressbook-report-request.js';
import {
  buildAddressObjectResponses,
  checkSupportedAddressData,
  resolveReportAddressbook,
  toAddressbookUrl,
} from './addressbook-report-support.js';
import { CARDDAV_NAMESPACE } from './carddav-namespace.js';

/** How many contact names one `IN (...)` lookup carries — well below every supported driver's bound-parameter limit. */
const NAME_LOOKUP_CHUNK_SIZE = 500;

/** A parsed `CARDDAV:addressbook-multiget` request body (RFC 6352 §8.7/§10.7). */
export interface AddressbookMultigetRequestBody {
  /** The properties (and `address-data` options) to return per contact. */
  selection: ReportPropertySelection;
  /** The `<D:href>` values, trimmed, in request order. Never empty. */
  hrefs: string[];
}

/**
 * Parses an `addressbook-multiget` REPORT request body.
 *
 * @throws An `Error` (including the XML parser's own `SyntaxError` for
 * malformed input) if `xml` isn't a well-formed
 * `CARDDAV:addressbook-multiget` document, has no `<D:href>` (RFC 6352
 * §10.7: `DAV:href+`), or has a malformed `address-data`.
 */
export function parseAddressbookMultigetRequestBody(
  xml: string,
): AddressbookMultigetRequestBody {
  const root: XmlNode = create(xml).root();
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'addressbook-multiget' ||
    rootElement.namespaceURI !== CARDDAV_NAMESPACE
  ) {
    throw new Error(
      `Expected a CARDDAV:addressbook-multiget root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
    );
  }

  const hrefs: string[] = [];
  root.each((child) => {
    const element = asElement(child.node);
    if (
      element?.namespaceURI === DAV_NAMESPACE &&
      element.localName === 'href'
    ) {
      hrefs.push((child.node.textContent ?? '').trim());
    }
  });
  if (hrefs.length === 0) {
    throw new Error('CARDDAV:addressbook-multiget body has no DAV:href.');
  }

  return { selection: parseReportPropertySelection(root), hrefs };
}

/**
 * The decoded path segments of `href` (an absolute path or absolute URL,
 * RFC 4918 §8.3) — `null` if it can't be parsed or has a malformed
 * percent-escape. `URL` also resolves any `.`/`..` segments, so a
 * traversal attempt is compared as the path it actually names.
 */
function toPathSegments(href: string): string[] | null {
  let pathname: string;
  try {
    pathname = new URL(href, 'http://localhost').pathname;
  } catch {
    return null;
  }
  try {
    return pathname.split('/').slice(1).map(decodeURIComponent);
  } catch {
    return null;
  }
}

/**
 * The contact name `href` addresses, provided it is exactly one segment
 * below the addressbook (`bookSegments`) — else `null`: another
 * addressbook, another user, another tree, the addressbook itself, or a
 * deeper path all address nothing *inside this addressbook*.
 */
function contactNameOf(
  href: string,
  bookSegments: readonly string[],
): string | null {
  const segments = toPathSegments(href);
  if (
    segments === null ||
    segments.length !== bookSegments.length + 1 ||
    !bookSegments.every((segment, index) => segments[index] === segment)
  ) {
    return null;
  }
  const name = segments[segments.length - 1];
  return name === '' ? null : name;
}

async function findContactsByName(
  manager: EntityManager,
  addressbookId: string,
  names: readonly string[],
): Promise<AddressObject[]> {
  const found: AddressObject[] = [];
  for (let start = 0; start < names.length; start += NAME_LOOKUP_CHUNK_SIZE) {
    found.push(
      ...(await manager.getRepository(AddressObject).findBy({
        addressbookId,
        name: In(names.slice(start, start + NAME_LOOKUP_CHUNK_SIZE)),
      })),
    );
  }
  return found;
}

/**
 * Handles the `{CARDDAV:}addressbook-multiget` REPORT (RFC 6352 §8.7):
 * the client names the contacts it wants by `<D:href>` — the usual second
 * step after `sync-collection` reported which ones changed — and gets one
 * `<D:response>` per href, in request order.
 *
 * **Target**: the Request-URI must be an addressbook
 * (`/dav/{tenant}/addressbooks/{userId}/{addressbookName}`); anything
 * else is `404`, like `sync-collection` does. RFC 6352 §8.7 also allows
 * the report on an address object resource itself, but with a mandatory
 * `DAV:href+` that reading makes nothing usable, so it isn't supported.
 *
 * **Authorization**: `read` on the addressbook gates the whole request
 * (`403`, empty body), the same check `sync-collection` makes — without
 * it, per-href `404`/`403` answers would reveal which names exist to a
 * caller with no access at all. On top of that every contact needs
 * `read` on itself, exactly as `GET` does (a contact's own ACEs can deny
 * what the addressbook grants); a denied contact's response is `403`
 * (RFC 6352 §8.7: "the appropriate error status code in the DAV:status
 * element of the corresponding DAV:response").
 *
 * **Hrefs** — absolute paths or absolute URLs, percent-decoded per
 * segment — resolve only when they name a contact exactly one segment
 * below *this* addressbook. Everything else (another addressbook or
 * user, a deeper path, the addressbook itself, an unparsable href) and
 * every non-existent contact is a bare `404` response echoing the href
 * as the client sent it; there is no cross-addressbook resolution, so a
 * contact elsewhere can't be read — or even told apart from a missing
 * one — through this addressbook's URL. Duplicate hrefs are answered
 * once. A `200` response carries the contact's canonical href.
 *
 * **`Depth`**: ignored. RFC 6352 §8.7 requires the client to send
 * `Depth: 0` but states that the scope is determined by the hrefs, so
 * the header changes nothing and a missing or different value isn't
 * worth rejecting.
 *
 * The properties per contact follow `buildAddressObjectResponses`
 * (`getetag` etc. plus `CARDDAV:address-data`); a body with no
 * `<D:href>` is `400`.
 */
export class AddressbookMultigetReportHandler implements ReportHandler {
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

    let request: AddressbookMultigetRequestBody;
    try {
      request = parseAddressbookMultigetRequestBody(requestXml);
    } catch {
      return { status: 400, body: '' };
    }
    const unsupported = checkSupportedAddressData(request.selection);
    if (unsupported) {
      return unsupported;
    }

    const bookSegments = toPathSegments(
      toAddressbookUrl(addressbook, context.tenant),
    );
    if (bookSegments === null) {
      throw new Error('The addressbook URL is not a parsable path.');
    }
    const requested = request.hrefs.map((href) => ({
      href,
      name: contactNameOf(href, bookSegments),
    }));

    const names = [
      ...new Set(
        requested.flatMap(({ name }) => (name === null ? [] : [name])),
      ),
    ];
    const contacts = await findContactsByName(
      context.manager,
      addressbook.id,
      names,
    );
    const readable = await selectAddressObjectsWithPrivilege(
      context.manager,
      context.principal,
      addressbook,
      contacts,
      'read',
    );
    const readableContacts = contacts.filter((contact) =>
      readable.has(contact.id),
    );
    const rendered = await buildAddressObjectResponses(
      context,
      addressbook,
      readableContacts,
      request.selection,
    );
    const renderedByName = new Map(
      readableContacts.map((contact, index) => [contact.name, rendered[index]]),
    );
    const existingNames = new Set(contacts.map((contact) => contact.name));

    const seen = new Set<string>();
    const responses: MultistatusResourceResult[] = [];
    for (const { href, name } of requested) {
      const key = name === null ? `href:${href}` : `name:${name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      if (name === null || !existingNames.has(name)) {
        responses.push({ href, properties: [], status: 404 });
        continue;
      }
      const response = renderedByName.get(name);
      responses.push(response ?? { href, properties: [], status: 403 });
    }

    return { status: 207, body: buildMultistatusResponse(responses) };
  }
}
