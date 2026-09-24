import { In, type EntityManager } from 'typeorm';
import { AddressObjectContent } from '../entities/address-object-content.entity.js';
import type { AddressObject } from '../entities/address-object.entity.js';
import { AddressbookCollection } from '../entities/addressbook-collection.entity.js';
import type { Tenant } from '../entities/tenant.entity.js';
import { PropertyProviderRegistry } from '../webdav/properties/property-provider-registry.js';
import type {
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import type { ReportContext, ReportResult } from '../webdav/report-registry.js';
import { buildErrorResponse } from '../webdav/xml/error-response-builder.js';
import type {
  MultistatusPropertyResult,
  MultistatusResourceResult,
} from '../webdav/xml/multistatus-builder.js';
import { escapeXmlText } from '../webdav/xml/xml-value.js';
import { AddressObjectLiveProperties } from './address-object-live-properties.js';
import {
  ADDRESS_DATA_PROPERTY,
  type AddressDataRequest,
  type ReportPropertySelection,
} from './addressbook-report-request.js';
import { toAddressbookHomeUrl } from './addressbook-home-url.js';
import { CARDDAV_NAMESPACE } from './carddav-namespace.js';
import { filterVCardProperties, readVCardVersion } from './vcard-partial.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The vCard versions this server stores (PUT parses 3.0 and 4.0) — see {@link checkSupportedAddressData}. */
const SUPPORTED_VCARD_VERSIONS = new Set(['3.0', '4.0']);

/** How many address object ids one `IN (...)` content lookup carries — well below every supported driver's bound-parameter limit. */
const CONTENT_LOOKUP_CHUNK_SIZE = 500;

const liveProperties = new PropertyProviderRegistry<AddressObject>();
liveProperties.register(new AddressObjectLiveProperties());

/**
 * Resolves a CardDAV REPORT's Request-URI —
 * `/dav/{tenant}/addressbooks/{userId}/{addressbookName}`, with or
 * without a trailing slash — to that `AddressbookCollection`, the same
 * lookup `AddressbookSyncCollectionDomain.resolveTarget` and the
 * contact routes do (by owner id and `displayName`, addressbook names
 * being the URL identity). Any other path — the home collection, a
 * contact, another tree — resolves to `null`.
 *
 * A `{userId}` that isn't a UUID can't match any owner and is answered
 * `null` without querying: Postgres would otherwise reject the
 * malformed uuid comparison with a driver error (a `500`), where the
 * other drivers simply find nothing.
 *
 * @param context - The REPORT's request context.
 */
export async function resolveReportAddressbook(
  context: ReportContext,
): Promise<AddressbookCollection | null> {
  const segments = [...context.segments];
  if (segments.at(-1) === '') {
    segments.pop();
  }
  const [tree, ownerPrincipalId, addressbookName, ...rest] = segments;
  if (
    tree !== 'addressbooks' ||
    ownerPrincipalId === undefined ||
    !UUID_PATTERN.test(ownerPrincipalId) ||
    addressbookName === undefined ||
    addressbookName === '' ||
    rest.length > 0
  ) {
    return null;
  }
  return context.manager.getRepository(AddressbookCollection).findOneBy({
    tenantId: context.tenant.id,
    ownerPrincipalId,
    displayName: addressbookName,
  });
}

/** The DAV URL of `addressbook` (no trailing slash, like every other addressbook href this server emits). */
export function toAddressbookUrl(
  addressbook: AddressbookCollection,
  tenant: Tenant,
): string {
  return `${toAddressbookHomeUrl(addressbook.ownerPrincipalId, tenant)}/${encodeURIComponent(addressbook.displayName)}`;
}

/**
 * Checks a request's `CARDDAV:address-data` attributes against what this
 * server stores: `content-type` must be `text/vcard` and `version` 3.0
 * or 4.0 (RFC 6352 §8.6/§8.7's `supported-address-data` precondition).
 * Absent attributes are always fine.
 *
 * @returns `null` if the request is acceptable, else the complete `403`
 * result naming the violated precondition.
 */
export function checkSupportedAddressData(
  selection: ReportPropertySelection,
): ReportResult | null {
  if (selection.kind !== 'prop' || selection.addressData === null) {
    return null;
  }
  const { contentType, version } = selection.addressData;
  const contentTypeSupported =
    contentType === undefined ||
    contentType.trim().toLowerCase() === 'text/vcard';
  const versionSupported =
    version === undefined || SUPPORTED_VCARD_VERSIONS.has(version.trim());
  if (contentTypeSupported && versionSupported) {
    return null;
  }
  return {
    status: 403,
    body: buildErrorResponse([
      { namespace: CARDDAV_NAMESPACE, name: 'supported-address-data' },
    ]),
  };
}

/** The raw vCard text of each of `addressObjectIds`, keyed by id. */
async function loadVCardData(
  manager: EntityManager,
  addressObjectIds: readonly string[],
): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  for (
    let start = 0;
    start < addressObjectIds.length;
    start += CONTENT_LOOKUP_CHUNK_SIZE
  ) {
    const rows = await manager.getRepository(AddressObjectContent).findBy({
      addressObjectId: In(
        addressObjectIds.slice(start, start + CONTENT_LOOKUP_CHUNK_SIZE),
      ),
    });
    for (const row of rows) {
      byId.set(row.addressObjectId, row.vcardData);
    }
  }
  return byId;
}

/**
 * The `CARDDAV:address-data` value of one contact, or `null` when the
 * contact can't be served in the version the client explicitly asked
 * for. There is no vCard conversion (M11's compatibility work, see
 * `milestones/M5-carddav/00-setting-goal.md`): a request naming a
 * `version` other than the one the contact is stored in gets RFC 6352
 * §8.7.2's per-response `415` +
 * `CARDDAV:supported-address-data-conversion`, while a request without
 * a `version` gets the contact as stored.
 */
function renderAddressData(
  vcard: string,
  request: AddressDataRequest,
): string | null {
  if (request.version !== undefined) {
    const storedVersion = readVCardVersion(vcard);
    if (storedVersion !== null && storedVersion !== request.version.trim()) {
      return null;
    }
  }
  const data =
    request.properties === undefined
      ? vcard
      : filterVCardProperties(vcard, request.properties);
  return escapeXmlText(data);
}

/**
 * Builds the `<D:response>` entries for `contacts` — the property
 * selection logic `addressbook-multiget` and `addressbook-query` share
 * (RFC 6352 §8.6: "modeled on PROPFIND"):
 *
 * - `allprop`: every live property (`AddressObjectLiveProperties`);
 * - `propname`: those properties' names, without values;
 * - `prop`: each requested property as a `200`, or a `404` propstat for
 *   one the server doesn't define (dead properties don't exist for
 *   contacts yet, so nothing else can match). `CARDDAV:address-data`
 *   is resolved here rather than by a property provider: RFC 6352
 *   §10.4 stresses it "is not a WebDAV property" and mustn't appear in
 *   PROPFIND.
 *
 * The vCard text is loaded (one query per {@link CONTENT_LOOKUP_CHUNK_SIZE}
 * contacts) only when `address-data` is actually requested.
 *
 * @param context - The REPORT's request context.
 * @param addressbook - The addressbook `contacts` belong to.
 * @param contacts - The contacts to render, in response order.
 * @param selection - The properties the request asked for.
 */
export async function buildAddressObjectResponses(
  context: ReportContext,
  addressbook: AddressbookCollection,
  contacts: readonly AddressObject[],
  selection: ReportPropertySelection,
): Promise<MultistatusResourceResult[]> {
  const addressbookUrl = toAddressbookUrl(addressbook, context.tenant);
  const propertyContext: PropertyProviderContext = {
    tenant: context.tenant,
    principal: context.principal,
    manager: context.manager,
  };
  const wantsAddressData =
    selection.kind === 'prop' && selection.addressData !== null;
  const vcards = wantsAddressData
    ? await loadVCardData(
        context.manager,
        contacts.map((contact) => contact.id),
      )
    : new Map<string, string>();

  const responses: MultistatusResourceResult[] = [];
  for (const contact of contacts) {
    const href = `${addressbookUrl}/${encodeURIComponent(contact.name)}`;
    const live: PropertyValue[] = await liveProperties.listLiveProperties(
      contact,
      propertyContext,
    );

    if (selection.kind === 'allprop') {
      responses.push({
        href,
        properties: live.map((property) => ({ ...property, status: 200 })),
      });
      continue;
    }
    if (selection.kind === 'propname') {
      responses.push({
        href,
        properties: live.map(({ namespace, name }) => ({
          namespace,
          name,
          status: 200,
        })),
      });
      continue;
    }

    const properties: MultistatusPropertyResult[] = [];
    let conversionFailed = false;
    for (const requested of selection.properties) {
      if (
        requested.namespace === ADDRESS_DATA_PROPERTY.namespace &&
        requested.name === ADDRESS_DATA_PROPERTY.name &&
        selection.addressData !== null
      ) {
        const vcard = vcards.get(contact.id);
        if (vcard === undefined) {
          properties.push({ ...requested, status: 404 });
          continue;
        }
        const value = renderAddressData(vcard, selection.addressData);
        if (value === null) {
          conversionFailed = true;
          break;
        }
        properties.push({ ...requested, value, status: 200 });
        continue;
      }
      const found = live.find(
        (property) =>
          property.namespace === requested.namespace &&
          property.name === requested.name,
      );
      properties.push(
        found ? { ...found, status: 200 } : { ...requested, status: 404 },
      );
    }

    responses.push(
      conversionFailed
        ? {
            href,
            properties: [],
            status: 415,
            error: [
              {
                namespace: CARDDAV_NAMESPACE,
                name: 'supported-address-data-conversion',
              },
            ],
          }
        : { href, properties },
    );
  }
  return responses;
}
