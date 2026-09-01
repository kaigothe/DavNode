import type { Group } from '../entities/group.entity.js';
import type { User } from '../entities/user.entity.js';

/**
 * Which level of the `/principals/` subtree a
 * {@link VirtualPrincipalCollection} stands in for.
 */
export type VirtualPrincipalCollectionKind = 'root' | 'users' | 'groups';

/**
 * A synthetic (non-DB-backed) node in the `/principals/` subtree:
 * `/principals/`, `/principals/users/`, or `/principals/groups/`
 * themselves. None of these has a `Principal` row of its own — only the
 * individual user/group principals beneath them do — but PROPFIND still
 * needs something to resolve and report properties for at those URLs
 * (RFC 3744 §5.8).
 */
export class VirtualPrincipalCollection {
  constructor(public readonly kind: VirtualPrincipalCollectionKind) {}
}

/**
 * Everything a PROPFIND request against the `/principals/` subtree can
 * resolve to (`principals.route.ts`): one of the three synthetic
 * collection nodes, or an actual user/group principal. `User`/`Group`
 * (not the bare `Principal` row) are used for the latter two, since
 * `displayname` comes from `User.username`/`Group.name` — a `Principal`
 * row alone doesn't carry a name.
 */
export type PrincipalTreeResource = VirtualPrincipalCollection | User | Group;
