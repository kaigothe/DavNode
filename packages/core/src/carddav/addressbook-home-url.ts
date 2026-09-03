import type { Tenant } from '../entities/tenant.entity.js';

/**
 * Builds the DAV URL for a user principal's virtual addressbook home
 * collection (`/dav/{tenantSlug}/addressbooks/{userPrincipalId}`, RFC
 * 6352 §7.1.1, planning/05-data-model.md's URL schema). A pure string
 * transformation — no DB access, no HTTP — mirroring `toPrincipalUrl`
 * (`principals/principal-url.ts`): no trailing slash, matching that
 * function and `resolveCollectionHref`'s convention for every other DAV
 * collection URL this codebase builds.
 *
 * Takes the raw principal id rather than a `User`/`Principal` object:
 * unlike `toPrincipalUrl` (which also handles groups and validates
 * `kind`), every addressbook home belongs to a user, and the id is all
 * that's needed.
 *
 * @param userPrincipalId - The user principal's id (`User.principalId`,
 * same value as `AddressbookCollection.ownerPrincipalId`).
 * @param tenant - The principal's tenant, whose `slug` forms the URL's
 * path prefix.
 * @returns The addressbook home collection's DAV URL.
 */
export function toAddressbookHomeUrl(
  userPrincipalId: string,
  tenant: Tenant,
): string {
  return `/dav/${tenant.slug}/addressbooks/${userPrincipalId}`;
}
