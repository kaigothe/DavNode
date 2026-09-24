import {
  CalendarCollection,
  CalendarObject,
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
