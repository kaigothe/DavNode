import type { Tenant } from '../entities/tenant.entity.js';

/**
 * Builds the DAV URL for a user principal's virtual calendar home
 * collection (`/dav/{tenantSlug}/calendars/{userPrincipalId}`, RFC 4791
 * §6.2.1, planning/05-data-model.md's URL schema). A pure string
 * transformation — no DB access, no HTTP — mirroring
 * `toAddressbookHomeUrl`: no trailing slash, matching every other DAV
 * collection URL this codebase builds.
 *
 * @param userPrincipalId - The user principal's id (`User.principalId`,
 * same value as `CalendarCollection.ownerPrincipalId`).
 * @param tenant - The principal's tenant, whose `slug` forms the URL's
 * path prefix.
 * @returns The calendar home collection's DAV URL.
 */
export function toCalendarHomeUrl(
  userPrincipalId: string,
  tenant: Tenant,
): string {
  return `/dav/${tenant.slug}/calendars/${userPrincipalId}`;
}

/**
 * Builds the DAV URL of a calendar
 * (`/dav/{tenantSlug}/calendars/{ownerPrincipalId}/{name}`, no trailing
 * slash): the home URL plus the calendar's own `name`, percent-encoded
 * as one path segment. A pure string transformation, like
 * {@link toCalendarHomeUrl}.
 *
 * @param calendar - The calendar's owner and URL name.
 * @param tenant - The calendar's tenant, whose `slug` forms the prefix.
 * @returns The calendar's DAV URL.
 */
export function toCalendarUrl(
  calendar: { ownerPrincipalId: string; name: string },
  tenant: Tenant,
): string {
  return `${toCalendarHomeUrl(calendar.ownerPrincipalId, tenant)}/${encodeURIComponent(calendar.name)}`;
}

/**
 * Builds the DAV URL of a calendar object resource — its calendar's URL
 * plus the object's `name`, percent-encoded as one path segment (what
 * `no-uid-conflict` and REPORT responses name it by).
 *
 * @param calendar - The calendar the object lives in.
 * @param objectName - The object's URL name (`CalendarObject.name`).
 * @param tenant - The calendar's tenant.
 * @returns The object's DAV URL.
 */
export function toCalendarObjectUrl(
  calendar: { ownerPrincipalId: string; name: string },
  objectName: string,
  tenant: Tenant,
): string {
  return `${toCalendarUrl(calendar, tenant)}/${encodeURIComponent(objectName)}`;
}
