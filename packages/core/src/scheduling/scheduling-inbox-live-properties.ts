import { CALDAV_NAMESPACE } from '../caldav/caldav-namespace.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import { escapeXmlText } from '../webdav/xml/xml-value.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import {
  SchedulingInboxCollection,
  type SchedulingInboxTreeResource,
} from './scheduling-inbox-tree-resource.js';

const DAV_LIVE_PROPERTY_NAMES = new Set([
  'displayname',
  'resourcetype',
  'getetag',
  'getcontenttype',
  'getlastmodified',
]);

function property(name: string, value: string): PropertyValue {
  return { namespace: DAV_NAMESPACE, name, value };
}

/**
 * Live properties for the `/dav/{tenant}/calendars/{userId}/inbox/`
 * subtree (`inbox.route.ts`): the collection itself, and each
 * `SchedulingInboxItem` beneath it. Mirrors `CalendarLiveProperties`
 * (M6) for this domain.
 *
 * The collection reports `DAV:collection` **and**
 * `CALDAV:schedule-inbox` in its `resourcetype` (RFC 6638 §2.2: "A
 * scheduling Inbox collection MUST report the DAV:collection and
 * CALDAV:schedule-inbox XML elements in the value of the
 * DAV:resourcetype property"). An item is an ordinary, non-collection
 * resource: empty `resourcetype`, `getetag` from its own `etag`,
 * `getcontenttype` fixed at `text/calendar` (the only thing
 * `SchedulingInboxItem.icsData` ever holds), `getlastmodified` from
 * when it was delivered (items are never modified after insertion).
 */
export class SchedulingInboxLiveProperties implements PropertyProvider<SchedulingInboxTreeResource> {
  /**
   * See {@link PropertyProvider.listLiveProperties}. Ignores `context` —
   * every property here is derived purely from `resource`'s own data.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface even though this implementation has no actual await.
  async listLiveProperties(
    resource: SchedulingInboxTreeResource,
    _context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    if (resource instanceof SchedulingInboxCollection) {
      return [
        property('displayname', escapeXmlText('inbox')),
        property(
          'resourcetype',
          `<D:collection xmlns:D="${DAV_NAMESPACE}"/><C:schedule-inbox xmlns:C="${CALDAV_NAMESPACE}"/>`,
        ),
      ];
    }

    return [
      property('resourcetype', ''),
      property('getetag', resource.etag),
      property('getcontenttype', 'text/calendar; charset=utf-8'),
      property('getlastmodified', resource.createdAt.toUTCString()),
    ];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === DAV_NAMESPACE && DAV_LIVE_PROPERTY_NAMES.has(name);
  }
}
