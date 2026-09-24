import type { CalendarObject } from '../entities/calendar-object.entity.js';
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

/** Every `CalendarObject` is iCalendar text; unlike a `FileResource`, there is no stored content type. */
const ICALENDAR_CONTENT_TYPE = 'text/calendar; charset=utf-8';

function property(name: string, value: string): PropertyValue {
  return { namespace: DAV_NAMESPACE, name, value };
}

/**
 * The core WebDAV live-property set (RFC 4918 §15) for a single
 * `CalendarObject` — the event-level counterpart of
 * `CalendarLiveProperties`, which covers the home collection and
 * `CalendarCollection` rows. Needed by the calendar `sync-collection`
 * report, whose `200` responses describe changed objects (typically asking
 * for `DAV:getetag`), and by the CalDAV REPORTs.
 *
 * Mirrors `AddressObjectLiveProperties`: `getetag` is the stored strong
 * ETag verbatim, `resourcetype` is empty (an object is not a collection),
 * and `getcontenttype` is always the iCalendar media type.
 * `getcontentlength` is deliberately omitted — it would need the body
 * loaded from `CalendarObjectContent`, and nothing asks for it yet.
 * `CALDAV:calendar-data` belongs to the CalDAV REPORTs
 * (`milestones/M6-caldav/06-caldav-reports`), not here.
 */
export class CalendarObjectLiveProperties implements PropertyProvider<CalendarObject> {
  /**
   * See {@link PropertyProvider.listLiveProperties}. Ignores `context` —
   * every property here is derived purely from `resource`'s own columns.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface even though this implementation has no actual await.
  async listLiveProperties(
    resource: CalendarObject,
    _context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    return [
      property('creationdate', resource.createdAt.toISOString()),
      property('getlastmodified', resource.updatedAt.toUTCString()),
      property('displayname', escapeXmlText(resource.name)),
      property('resourcetype', ''),
      property('getcontenttype', escapeXmlText(ICALENDAR_CONTENT_TYPE)),
      property('getetag', escapeXmlText(resource.etag)),
    ];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === DAV_NAMESPACE && LIVE_PROPERTY_NAMES.has(name);
  }
}
