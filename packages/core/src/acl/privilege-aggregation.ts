import { ALL_PRIVILEGES, type Privilege } from './privilege.js';

/**
 * Resolves an aggregated {@link Privilege} into its constituents, per
 * planning/05-data-model.md ("ACL-Privilege-Katalog"):
 * - `all` expands to the entire eleven-value vocabulary (including
 *   itself — RFC 3744 §5.3 defines `DAV:all` as covering every
 *   privilege, and the vocabulary has exactly eleven members total).
 * - `write` expands to `write-properties` and `write-content`.
 * - Every other (elementary) privilege expands to only itself.
 *
 * Resolved at evaluation time rather than stored expanded in the
 * database — see the ACE entities (`CollectionAce`/`FileAce`).
 *
 * @param privilege - The privilege to expand.
 * @returns The privilege's constituent, elementary or aggregated,
 * privileges — never empty.
 */
export function expandPrivilege(privilege: Privilege): Privilege[] {
  switch (privilege) {
    case 'all':
      return [...ALL_PRIVILEGES];
    case 'write':
      return ['write-properties', 'write-content'];
    default:
      return [privilege];
  }
}

/**
 * Checks whether a granted (possibly aggregated) privilege covers a
 * requested (possibly elementary) privilege — e.g.
 * `privilegeSatisfies('all', 'read')` is `true` because `all` expands to
 * include `read`.
 *
 * @param granted - The privilege an ACE grants or denies.
 * @param requested - The privilege being checked for.
 * @returns Whether `granted` covers `requested`.
 */
export function privilegeSatisfies(
  granted: Privilege,
  requested: Privilege,
): boolean {
  return expandPrivilege(granted).includes(requested);
}
