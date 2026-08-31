import type { Principal } from '../entities/principal.entity.js';
import type { Tenant } from '../entities/tenant.entity.js';

/** URL path segment for each non-special {@link Principal} kind. */
const URL_SEGMENT_BY_KIND = {
  user: 'users',
  group: 'groups',
} as const;

/** Inverse of {@link URL_SEGMENT_BY_KIND}, for parsing. */
const KIND_BY_URL_SEGMENT: Record<string, 'user' | 'group'> = {
  users: 'user',
  groups: 'group',
};

/** Matches `/dav/{tenantSlug}/principals/{users|groups}/{id}`. */
const PRINCIPAL_URL_PATTERN =
  /^\/dav\/([a-z0-9-]+)\/principals\/(users|groups)\/([^/]+)$/;

/**
 * Builds the DAV URL for a user or group principal
 * (`/dav/{tenantSlug}/principals/{users|groups}/{principal.id}`, per
 * planning/05-data-model.md's URL schema). A pure string transformation —
 * no DB access, no HTTP. Resolving a URL back to an actual `Principal`
 * row is the service layer's job (Große Aufgabe 4), not this module's.
 *
 * @param principal - Must have `kind` `'user'` or `'group'` — special
 * principals (`kind: 'special'`) have no URL of their own, per RFC 3744
 * (see `special-principals.ts`).
 * @param tenant - The principal's tenant, whose `slug` forms the URL's
 * path prefix.
 * @returns The principal's DAV URL.
 * @throws An `Error` if `principal.kind` is `'special'`.
 */
export function toPrincipalUrl(principal: Principal, tenant: Tenant): string {
  if (principal.kind === 'special') {
    throw new Error(
      'Special principals have no URL of their own (RFC 3744); see special-principals.ts instead.',
    );
  }
  const segment = URL_SEGMENT_BY_KIND[principal.kind];
  return `/dav/${tenant.slug}/principals/${segment}/${principal.id}`;
}

/** The components of a parsed user/group principal URL. */
export interface ParsedPrincipalUrl {
  tenantSlug: string;
  kind: 'user' | 'group';
  id: string;
}

/**
 * Parses a user/group principal URL produced by {@link toPrincipalUrl}
 * back into its components. A pure string transformation — no DB access,
 * no HTTP.
 *
 * @param url - The URL to parse.
 * @returns The parsed components, or `null` if `url` doesn't match the
 * expected `/dav/{tenantSlug}/principals/{users|groups}/{id}` shape.
 */
export function parsePrincipalUrl(url: string): ParsedPrincipalUrl | null {
  const match = PRINCIPAL_URL_PATTERN.exec(url);
  if (!match) {
    return null;
  }
  const [, tenantSlug, segment, id] = match;
  return { tenantSlug, kind: KIND_BY_URL_SEGMENT[segment], id };
}
