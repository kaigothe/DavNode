import type { Principal } from '../entities/principal.entity.js';
import {
  PRINCIPAL_SPECIAL_KINDS,
  type PrincipalSpecialKind,
} from '../entities/principal.entity.js';

/**
 * The RFC 3744 special principals DavNode supports. Re-exported from
 * `Principal` for convenience — this is the same list the `specialKind`
 * column is constrained to.
 *
 * Special principals are **per-tenant**, not global singletons: each
 * tenant gets its own `all`/`authenticated`/`unauthenticated`/`owner`/
 * `self` rows (`kind: 'special'`, no owning `User`/`Group` row),
 * populated by the seed/bootstrap tooling — see
 * packages/core/README.md, "Special principals".
 */
export const SPECIAL_PRINCIPAL_KINDS = PRINCIPAL_SPECIAL_KINDS;

/**
 * RFC 3744 represents each special principal as its own XML element
 * inside `<D:principal>` (e.g. `<D:all/>`) rather than as an `<D:href>`
 * pointing at a URL — special principals have no URL of their own (see
 * `toPrincipalUrl` in `principal-url.ts`). This maps a `specialKind` to
 * that element's local name, for later ACL XML serialization (M3); it
 * does no actual XML building itself.
 */
const XML_ELEMENT_BY_SPECIAL_KIND: Record<PrincipalSpecialKind, string> = {
  authenticated: 'authenticated',
  unauthenticated: 'unauthenticated',
  all: 'all',
  owner: 'owner',
  self: 'self',
};

/**
 * Returns the RFC 3744 XML element local name for a special principal
 * kind (e.g. `'all'` for `<D:all/>`).
 */
export function toSpecialPrincipalXmlElement(
  specialKind: PrincipalSpecialKind,
): string {
  return XML_ELEMENT_BY_SPECIAL_KIND[specialKind];
}

/**
 * Whether `principal` is an RFC 3744 special principal (`DAV:all`,
 * `DAV:authenticated`, ...) rather than a regular user or group
 * principal.
 */
export function isSpecialPrincipal(principal: Principal): boolean {
  return principal.kind === 'special';
}
