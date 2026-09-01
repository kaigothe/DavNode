import type { EntityManager } from 'typeorm';
import { Principal } from '../entities/principal.entity.js';
import { GroupMembershipService } from '../services/group-membership.service.js';
import type { WebDavTreeResource } from '../webdav/resource-path-resolver.js';
import { type AceLike, type CollectedAce, collectWebDavAces } from './collect-aces.js';
import { ALL_PRIVILEGES, type Privilege } from './privilege.js';
import { privilegeSatisfies } from './privilege-aggregation.js';

/**
 * Every principal id an ACE could match for a given requesting
 * `principal` on a given resource — built once per evaluation (or once
 * for a whole batch, see {@link getCurrentUserPrivilegeSet}) and reused
 * across every ACE/privilege check, since it doesn't depend on either.
 *
 * Includes: `principal`'s own id; the id of every group (direct or
 * transitive, via `resolveGroupsForPrincipal`) `principal` belongs to;
 * the tenant's `DAV:authenticated` and `DAV:all` special principals
 * (always — by the time this runs, the request has already passed Basic
 * Auth, so the requester is always an authenticated principal); and the
 * tenant's `DAV:owner` special principal, but only when `principal` is
 * actually `resourceOwnerPrincipalId` — an ACE granting to `DAV:owner`
 * is a reusable rule ("whoever ends up owning this resource"), not a
 * concrete identity, so it applies to the current requester exactly
 * when they are that owner (see `TenantService.createTenant`, which
 * creates the per-tenant `DAV:owner` row this looks up).
 */
async function buildMatchingPrincipalIds(
  manager: EntityManager,
  principal: Principal,
  resourceOwnerPrincipalId: string,
): Promise<Set<string>> {
  const matchingPrincipalIds = new Set<string>([principal.id]);

  const groups = await new GroupMembershipService(
    manager.connection,
  ).resolveGroupsForPrincipal(principal.id);
  for (const group of groups) {
    matchingPrincipalIds.add(group.principalId);
  }

  const specialPrincipals = await manager.getRepository(Principal).findBy({
    tenantId: principal.tenantId,
    kind: 'special',
  });
  const isOwner = principal.id === resourceOwnerPrincipalId;
  for (const special of specialPrincipals) {
    if (
      special.specialKind === 'authenticated' ||
      special.specialKind === 'all' ||
      (special.specialKind === 'owner' && isOwner)
    ) {
      matchingPrincipalIds.add(special.id);
    }
  }

  return matchingPrincipalIds;
}

/**
 * RFC 3744 §5.4's first-match-wins algorithm over an already-collected,
 * ordered ACE list: the first ACE whose `principalId` is in
 * `matchingPrincipalIds` and whose `privilege` covers
 * `requestedPrivilege` (via `privilegeSatisfies`) decides the outcome —
 * `grant` → `true`, `deny` → `false` — and evaluation stops there,
 * without looking at the rest of the list. No matching ACE at all is
 * default-deny (`false`).
 *
 * Pure and synchronous (no I/O): `aces` is already fully collected, and
 * `matchingPrincipalIds` already fully resolved. Kept generic over the
 * ACE row type so it works for any domain's `collectAces` output, not
 * just WebDAV's.
 */
function evaluateAces<TAce extends AceLike>(
  aces: readonly CollectedAce<TAce>[],
  matchingPrincipalIds: ReadonlySet<string>,
  requestedPrivilege: Privilege,
): boolean {
  for (const ace of aces) {
    if (
      matchingPrincipalIds.has(ace.principalId) &&
      privilegeSatisfies(ace.privilege, requestedPrivilege)
    ) {
      return ace.grantDeny === 'grant';
    }
  }
  return false;
}

/**
 * Decides whether `principal` has `requestedPrivilege` on `resource`
 * (RFC 3744 §5.4): collects `resource`'s direct-then-inherited ACE list
 * ({@link collectWebDavAces}), builds `principal`'s matching principal-id
 * set, and evaluates first-match-wins over the list. Default-deny — no
 * matching ACE at all means `false`, not `true`.
 *
 * @param manager - The `EntityManager` to query with.
 * @param principal - The requesting principal (already authenticated).
 * @param resource - The resource access is being checked against.
 * @param requestedPrivilege - The privilege being checked for.
 */
export async function hasPrivilege(
  manager: EntityManager,
  principal: Principal,
  resource: WebDavTreeResource,
  requestedPrivilege: Privilege,
): Promise<boolean> {
  const [aces, matchingPrincipalIds] = await Promise.all([
    collectWebDavAces(manager, resource),
    buildMatchingPrincipalIds(manager, principal, resource.ownerPrincipalId),
  ]);
  return evaluateAces(aces, matchingPrincipalIds, requestedPrivilege);
}

/**
 * Resolves `principal`'s full effective privilege set on `resource` —
 * every catalog privilege (`ALL_PRIVILEGES`, including the aggregated
 * `write`/`all`) that {@link hasPrivilege} would return `true` for.
 * Backs the `DAV:current-user-privilege-set` live property (RFC 3744
 * §5.4, M3's ACL-Properties sub-task).
 *
 * Collects the ACE list and the matching principal-id set exactly once
 * and evaluates every privilege against that same pair, rather than
 * calling {@link hasPrivilege} in a loop (which would redo both fetches
 * for every one of the eleven privileges).
 *
 * @param manager - The `EntityManager` to query with.
 * @param principal - The requesting principal (already authenticated).
 * @param resource - The resource to resolve the privilege set for.
 * @returns The allowed privileges, in `ALL_PRIVILEGES` order.
 */
export async function getCurrentUserPrivilegeSet(
  manager: EntityManager,
  principal: Principal,
  resource: WebDavTreeResource,
): Promise<Privilege[]> {
  const [aces, matchingPrincipalIds] = await Promise.all([
    collectWebDavAces(manager, resource),
    buildMatchingPrincipalIds(manager, principal, resource.ownerPrincipalId),
  ]);
  return ALL_PRIVILEGES.filter((privilege) =>
    evaluateAces(aces, matchingPrincipalIds, privilege),
  );
}
