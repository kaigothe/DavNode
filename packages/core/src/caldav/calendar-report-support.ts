import { CalendarCollection } from '../entities/calendar-collection.entity.js';
import type { ReportContext } from '../webdav/report-registry.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a CalDAV REPORT's Request-URI —
 * `/dav/{tenant}/calendars/{userId}/{calendarName}`, with or without a
 * trailing slash — to that `CalendarCollection`, the same lookup the
 * calendar-object routes do (by owner id and `name`, the URL identity).
 * Any other path — the home collection, an object, another tree —
 * resolves to `null`. The calendar counterpart of
 * `resolveReportAddressbook`.
 *
 * A `{userId}` that isn't a UUID can't match any owner and is answered
 * `null` without querying: Postgres would otherwise reject the malformed
 * uuid comparison with a driver error (a `500`), where the other drivers
 * simply find nothing.
 *
 * @param context - The REPORT's request context.
 */
export async function resolveReportCalendar(
  context: ReportContext,
): Promise<CalendarCollection | null> {
  const segments = [...context.segments];
  if (segments.at(-1) === '') {
    segments.pop();
  }
  const [tree, ownerPrincipalId, calendarName, ...rest] = segments;
  if (
    tree !== 'calendars' ||
    ownerPrincipalId === undefined ||
    !UUID_PATTERN.test(ownerPrincipalId) ||
    calendarName === undefined ||
    calendarName === '' ||
    rest.length > 0
  ) {
    return null;
  }
  return context.manager.getRepository(CalendarCollection).findOneBy({
    tenantId: context.tenant.id,
    ownerPrincipalId,
    name: calendarName,
  });
}
