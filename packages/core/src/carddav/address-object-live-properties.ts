import type { AddressObject } from '../entities/address-object.entity.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import { escapeXmlText } from '../webdav/xml/xml-value.js';

const LIVE_PROPERTY_NAMES = new Set([
  'creationdate',
  'displayname',
  'getcontenttype',
  'getetag',
  'getlastmodified',
  'resourcetype',
]);

/** Every `AddressObject` is a vCard; unlike a `FileResource`, there is no stored content type. */
const VCARD_CONTENT_TYPE = 'text/vcard; charset=utf-8';

function property(name: string, value: string): PropertyValue {
  return { namespace: DAV_NAMESPACE, name, value };
}

/**
 * The core WebDAV live-property set (RFC 4918 §15) for a single
 * `AddressObject` — the contact-level counterpart of
 * `AddressbookLiveProperties`, which only covers the home collection and
 * `AddressbookCollection` rows. Needed by the addressbook
 * `sync-collection` report, whose `200` responses describe changed
 * contacts (typically asking for `DAV:getetag`).
 *
 * Mirrors what `WebDavLiveProperties` reports for a `FileResource`:
 * `getetag` is the stored ETag verbatim, `resourcetype` is empty (a
 * contact is not a collection), and `getcontenttype` is always the
 * vCard media type. `getcontentlength` is deliberately omitted — it
 * would need the vCard body loaded from `AddressObjectContent`, and
 * nothing asks for it yet. `CARD:address-data` belongs to the CardDAV
 * REPORTs (`milestones/M5-carddav/06-carddav-reports`), not here.
 */
export class AddressObjectLiveProperties implements PropertyProvider<AddressObject> {
  /**
   * See {@link PropertyProvider.listLiveProperties}. Ignores `context` —
   * every property here is derived purely from `resource`'s own columns.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface even though this implementation has no actual await.
  async listLiveProperties(
    resource: AddressObject,
    _context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    return [
      property('creationdate', resource.createdAt.toISOString()),
      property('getlastmodified', resource.updatedAt.toUTCString()),
      property('displayname', escapeXmlText(resource.name)),
      property('resourcetype', ''),
      property('getcontenttype', escapeXmlText(VCARD_CONTENT_TYPE)),
      property('getetag', escapeXmlText(resource.etag)),
    ];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === DAV_NAMESPACE && LIVE_PROPERTY_NAMES.has(name);
  }
}
