import {
  CalendarCollection,
  CalendarObject,
  type CalendarAclResource,
  type DataSource,
} from '@davnode/core';

/**
 * Resolves the calendar named `calendarName`, owned by `ownerPrincipalId`
 * in `tenantId` — the first of the two path segments GET/PUT/DELETE on
 * `/dav/{tenant}/calendars/{userId}/{calendarName}/{objectName}` resolve,
 * by the same `(tenant, owner, name)` identity the home PROPFIND and
 * MKCALENDAR use.
 */
export async function resolveCalendar(
  dataSource: DataSource,
  tenantId: string,
  ownerPrincipalId: string,
  calendarName: string,
): Promise<CalendarCollection | null> {
  return dataSource.getRepository(CalendarCollection).findOneBy({
    tenantId,
    ownerPrincipalId,
    name: calendarName,
  });
}

/**
 * Resolves the calendar object named `objectName` within `calendarId` —
 * the second path segment, by its `(calendar, name)` identity.
 */
export async function resolveCalendarObject(
  dataSource: DataSource,
  calendarId: string,
  objectName: string,
): Promise<CalendarObject | null> {
  return dataSource
    .getRepository(CalendarObject)
    .findOneBy({ calendarId, name: objectName });
}

/**
 * Resolves the LOCK/UNLOCK target for
 * `/dav/{tenantSlug}/calendars/{userId}{/*splat}`: one segment addresses
 * the `CalendarCollection` itself, two a single `CalendarObject` inside it
 * — unlike GET/PUT/DELETE (which only ever address an object), LOCK/UNLOCK
 * can target either, the same way the WebDAV LOCK route can target a
 * `Collection` or a `FileResource`.
 */
export async function resolveCalendarLockTarget(
  dataSource: DataSource,
  tenantId: string,
  ownerPrincipalId: string,
  segments: string[],
): Promise<CalendarAclResource | null> {
  if (segments.length === 1) {
    return resolveCalendar(dataSource, tenantId, ownerPrincipalId, segments[0]);
  }
  if (segments.length === 2) {
    const [calendarName, objectName] = segments;
    const calendar = await resolveCalendar(
      dataSource,
      tenantId,
      ownerPrincipalId,
      calendarName,
    );
    if (!calendar) {
      return null;
    }
    return resolveCalendarObject(dataSource, calendar.id, objectName);
  }
  return null;
}
