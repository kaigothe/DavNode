import { hasCalendarPrivilege } from '../acl/evaluate-privilege.js';
import { CalendarObject } from '../entities/calendar-object.entity.js';
import { PropertyProviderRegistry } from '../webdav/properties/property-provider-registry.js';
import type {
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import type { ReportContext } from '../webdav/report-registry.js';
import type {
  SyncCollectionDomain,
  SyncCollectionMember,
  SyncCollectionTarget,
} from '../webdav/sync/sync-collection-domain.js';
import type { PropertyName } from '../webdav/xml/request-parser.js';
import { CalendarChangeLog } from './calendar-change-log.js';
import { toCalendarObjectUrl, toCalendarUrl } from './calendar-home-url.js';
import { CalendarObjectLiveProperties } from './calendar-object-live-properties.js';
import { resolveReportCalendar } from './calendar-report-support.js';

/**
 * The calendar tree's side of `sync-collection`
 * (`/dav/{tenant}/calendars/{userId}/{calendarName}`, RFC 6578 as used by
 * CalDAV): the target is one `CalendarCollection`, authorization is `read`
 * via `hasCalendarPrivilege`, the change log is `calendar_changes`, and
 * members are the calendar's `CalendarObject`s carrying
 * `CalendarObjectLiveProperties`.
 *
 * The calendar is resolved by `resolveReportCalendar`, which accepts a
 * trailing slash on the Request-URI and answers a `{userId}` that isn't a
 * UUID with "not found" (Postgres would otherwise fail the query with a
 * `500`).
 *
 * Only live properties are resolved for members: there is no dead-property
 * service for calendar objects yet (no PROPPATCH route writes
 * `calendar_object_properties`), so a requested property this provider
 * doesn't define is reported `404` in its `<D:propstat>`.
 */
export class CalendarSyncCollectionDomain implements SyncCollectionDomain {
  private readonly changeLog = new CalendarChangeLog();
  private readonly registry = new PropertyProviderRegistry<CalendarObject>();

  constructor() {
    this.registry.register(new CalendarObjectLiveProperties());
  }

  /** See {@link SyncCollectionDomain.resolveTarget}. */
  async resolveTarget(
    context: ReportContext,
  ): Promise<SyncCollectionTarget | null> {
    const calendar = await resolveReportCalendar(context);
    if (!calendar) {
      return null;
    }

    const propertyContext: PropertyProviderContext = {
      tenant: context.tenant,
      principal: context.principal,
      manager: context.manager,
    };

    return {
      id: calendar.id,
      syncSeq: calendar.syncSeq,
      changeLog: this.changeLog,
      canRead: () =>
        hasCalendarPrivilege(
          context.manager,
          context.principal,
          calendar,
          'read',
        ),
      resolveHref: () =>
        Promise.resolve(toCalendarUrl(calendar, context.tenant)),
      listMembers: async (): Promise<SyncCollectionMember[]> => {
        const objects = await context.manager
          .getRepository(CalendarObject)
          .findBy({ calendarId: calendar.id });
        return objects.map((object) => ({
          name: object.name,
          resolveHref: () =>
            Promise.resolve(
              toCalendarObjectUrl(calendar, object.name, context.tenant),
            ),
          resolveProperties: async (requested: readonly PropertyName[]) => {
            const live: PropertyValue[] =
              await this.registry.listLiveProperties(object, propertyContext);
            return requested.map((request) => {
              const found = live.find(
                (p) =>
                  p.namespace === request.namespace && p.name === request.name,
              );
              return found
                ? { ...found, status: 200 }
                : { ...request, status: 404 };
            });
          },
        }));
      },
    };
  }
}
