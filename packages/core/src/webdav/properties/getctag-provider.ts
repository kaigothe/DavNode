import { AddressbookCollection } from '../../entities/addressbook-collection.entity.js';
import { CalendarCollection } from '../../entities/calendar-collection.entity.js';
import { Collection } from '../../entities/collection.entity.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from './property-provider.interface.js';

/** Namespace of Apple's CalendarServer extensions. */
export const CALENDARSERVER_NAMESPACE = 'http://calendarserver.org/ns/';

const GETCTAG = 'getctag';

/**
 * `{http://calendarserver.org/ns/}getctag` (M11, Apple compatibility): a
 * token that changes whenever anything inside a collection changes. It is
 * not an RFC property, but nearly every CalDAV and CardDAV client reads it
 * to learn with one cheap PROPFIND whether a full sync is needed.
 *
 * The value is the collection's `syncSeq` — the counter that already
 * advances with every member change for RFC 6578 `sync-collection` — as a
 * decimal string, so it needs no tracking of its own and stays consistent
 * with the sync token. Only the three collection types carry it
 * (`Collection`, `CalendarCollection`, `AddressbookCollection`); files,
 * events, contacts and the virtual home/principal collections do not.
 * Registered once per resource tree's registry, generic over the tree's
 * resource type like `QuotaPropertiesProvider`.
 */
export class GetctagProvider<TResource> implements PropertyProvider<TResource> {
  /** See {@link PropertyProvider.listLiveProperties}. */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface; the value comes straight from the resource.
  async listLiveProperties(
    resource: TResource,
    _context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    if (
      resource instanceof Collection ||
      resource instanceof CalendarCollection ||
      resource instanceof AddressbookCollection
    ) {
      return [
        {
          namespace: CALENDARSERVER_NAMESPACE,
          name: GETCTAG,
          value: String(resource.syncSeq),
        },
      ];
    }
    return [];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === CALENDARSERVER_NAMESPACE && name === GETCTAG;
  }
}
