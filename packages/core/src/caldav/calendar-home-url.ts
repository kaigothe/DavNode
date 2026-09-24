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
