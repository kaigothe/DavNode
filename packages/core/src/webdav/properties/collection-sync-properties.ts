import { AddressbookCollection } from '../../entities/addressbook-collection.entity.js';
import { CalendarCollection } from '../../entities/calendar-collection.entity.js';
import { Collection } from '../../entities/collection.entity.js';
import { encodeSyncToken } from '../sync/sync-token.js';
import { DAV_NAMESPACE } from '../xml/request-parser.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from './property-provider.interface.js';

const CALDAV_NS = 'urn:ietf:params:xml:ns:caldav';
const CARDDAV_NS = 'urn:ietf:params:xml:ns:carddav';

const NAMES = new Set(['supported-report-set', 'sync-token']);

/** One `<D:supported-report>` entry for a report element in `namespace`. */
function supportedReport(prefix: string, namespace: string, name: string) {
  return (
    `<D:supported-report xmlns:D="${DAV_NAMESPACE}"><D:report>` +
    `<${prefix}:${name} xmlns:${prefix}="${namespace}"/>` +
    `</D:report></D:supported-report>`
  );
}

const SYNC_COLLECTION = supportedReport('D', DAV_NAMESPACE, 'sync-collection');

/** The reports a calendar answers (what `report.route` has handlers for). */
const CALENDAR_REPORTS = [
  supportedReport('C', CALDAV_NS, 'calendar-query'),
  supportedReport('C', CALDAV_NS, 'calendar-multiget'),
  supportedReport('C', CALDAV_NS, 'free-busy-query'),
  SYNC_COLLECTION,
];

/** The reports an addressbook answers. */
const ADDRESSBOOK_REPORTS = [
  supportedReport('A', CARDDAV_NS, 'addressbook-query'),
  supportedReport('A', CARDDAV_NS, 'addressbook-multiget'),
  SYNC_COLLECTION,
];

/**
 * `DAV:supported-report-set` (RFC 3253 §3.1.5) and `DAV:sync-token` (RFC 6578
 * §4) of the three collection types (M11, client compatibility).
 *
 * Clients read the first to learn which reports a collection answers —
 * `sync-collection` above all, which decides between incremental sync and
 * re-reading everything — and the second to start an incremental sync
 * without a first REPORT. The token is the same value a `sync-collection`
 * REPORT returns, built from the collection id and its `syncSeq`.
 *
 * Generic over the resource tree's type, like `GetctagProvider`; resources
 * that are not collections (files, events, contacts, the virtual homes)
 * report neither property.
 */
export class CollectionSyncProperties<
  TResource,
> implements PropertyProvider<TResource> {
  /** See {@link PropertyProvider.listLiveProperties}. */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface; the values come straight from the resource.
  async listLiveProperties(
    resource: TResource,
    _context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    let reports: string[];
    if (resource instanceof CalendarCollection) {
      reports = CALENDAR_REPORTS;
    } else if (resource instanceof AddressbookCollection) {
      reports = ADDRESSBOOK_REPORTS;
    } else if (resource instanceof Collection) {
      reports = [SYNC_COLLECTION];
    } else {
      return [];
    }
    return [
      {
        namespace: DAV_NAMESPACE,
        name: 'supported-report-set',
        value: reports.join(''),
      },
      {
        namespace: DAV_NAMESPACE,
        name: 'sync-token',
        value: encodeSyncToken(resource.id, resource.syncSeq),
      },
    ];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === DAV_NAMESPACE && NAMES.has(name);
  }
}
