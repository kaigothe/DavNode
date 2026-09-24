import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import { escapeXmlText } from '../webdav/xml/xml-value.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import type { CalendarComponentType } from '../entities/calendar-collection.entity.js';
import { CALDAV_NAMESPACE } from './caldav-namespace.js';
import { MAX_CALENDAR_OBJECT_BYTES } from './calendar-limits.js';
import {
  CalendarHomeCollection,
  type CalendarHomeTreeResource,
} from './calendar-home-tree-resource.js';

const DAV_LIVE_PROPERTY_NAMES = new Set([
  'creationdate',
  'displayname',
  'getlastmodified',
  'resourcetype',
]);

const CALDAV_LIVE_PROPERTY_NAMES = new Set([
  'calendar-description',
  'calendar-timezone',
  'supported-calendar-component-set',
  'supported-calendar-data',
  'max-resource-size',
]);

function property(
  namespace: string,
  name: string,
  value: string,
): PropertyValue {
  return { namespace, name, value };
}

/**
 * The XML content of `CALDAV:supported-calendar-component-set` for
 * `components` (RFC 4791 §5.2.3): one `<C:comp name="..."/>` per type,
 * each self-contained like every other live property value.
 */
export function serializeComponentSet(
  components: readonly CalendarComponentType[],
): string {
  return components
    .map(
      (component) =>
        `<C:comp name="${component}" xmlns:C="${CALDAV_NAMESPACE}"/>`,
    )
    .join('');
}

/**
 * Live properties for the `/dav/{tenant}/calendars/{userId}/` subtree
 * (`calendar-home.route.ts`): the virtual home collection itself, and
 * each of its owner's actual `CalendarCollection` rows. Mirrors
 * `AddressbookLiveProperties` (M5) for this domain.
 *
 * A `CalendarCollection`'s `resourcetype` reports **both**
 * `DAV:collection` and `CALDAV:calendar` — RFC 4791 §4.2: "A calendar
 * collection MUST report the DAV:collection and CALDAV:calendar XML
 * elements in the value of the DAV:resourcetype property." The home
 * collection itself is just an ordinary `DAV:collection`: RFC 4791
 * §6.2.1 allows `calendar-home-set` to point at "ordinary collections
 * that have child or descendant calendar collections", and this
 * server's home is exactly that — a container, never a calendar.
 *
 * Besides the properties every collection has, a calendar reports the
 * CalDAV ones RFC 4791 §5.2 defines: `calendar-description` and
 * `calendar-timezone` only when the client set them, and always
 * `supported-calendar-component-set` (the stored set, §5.2.3) and
 * `supported-calendar-data` (iCalendar 2.0 as `text/calendar`, §5.2.4 —
 * what `parseCalendarObject` accepts) and `max-resource-size` (§5.2.5, the
 * most octets one calendar object may have). These three are protected:
 * only `MKCALENDAR` can initialise the component set, and nothing changes
 * the calendar-data type or the size limit.
 */
export class CalendarLiveProperties implements PropertyProvider<CalendarHomeTreeResource> {
  /**
   * See {@link PropertyProvider.listLiveProperties}. Ignores `context` —
   * every property here is derived purely from `resource`'s own data.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface even though this implementation has no actual await.
  async listLiveProperties(
    resource: CalendarHomeTreeResource,
    _context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    if (resource instanceof CalendarHomeCollection) {
      return [
        property(DAV_NAMESPACE, 'displayname', escapeXmlText('calendars')),
        property(
          DAV_NAMESPACE,
          'resourcetype',
          `<D:collection xmlns:D="${DAV_NAMESPACE}"/>`,
        ),
      ];
    }

    const properties: PropertyValue[] = [
      property(DAV_NAMESPACE, 'creationdate', resource.createdAt.toISOString()),
      property(
        DAV_NAMESPACE,
        'getlastmodified',
        resource.updatedAt.toUTCString(),
      ),
      property(
        DAV_NAMESPACE,
        'displayname',
        escapeXmlText(resource.displayName),
      ),
      property(
        DAV_NAMESPACE,
        'resourcetype',
        `<D:collection xmlns:D="${DAV_NAMESPACE}"/><C:calendar xmlns:C="${CALDAV_NAMESPACE}"/>`,
      ),
      property(
        CALDAV_NAMESPACE,
        'supported-calendar-component-set',
        serializeComponentSet(resource.supportedComponentSet),
      ),
      property(
        CALDAV_NAMESPACE,
        'supported-calendar-data',
        `<C:calendar-data content-type="text/calendar" version="2.0" xmlns:C="${CALDAV_NAMESPACE}"/>`,
      ),
      property(
        CALDAV_NAMESPACE,
        'max-resource-size',
        String(MAX_CALENDAR_OBJECT_BYTES),
      ),
    ];
    if (resource.description !== null) {
      properties.push(
        property(
          CALDAV_NAMESPACE,
          'calendar-description',
          escapeXmlText(resource.description),
        ),
      );
    }
    if (resource.timezone !== null) {
      properties.push(
        property(
          CALDAV_NAMESPACE,
          'calendar-timezone',
          escapeXmlText(resource.timezone),
        ),
      );
    }
    return properties;
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    if (namespace === DAV_NAMESPACE) {
      return DAV_LIVE_PROPERTY_NAMES.has(name);
    }
    if (namespace === CALDAV_NAMESPACE) {
      return CALDAV_LIVE_PROPERTY_NAMES.has(name);
    }
    return false;
  }
}
