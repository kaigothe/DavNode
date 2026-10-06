import type { User, UserRole } from '../../entities/user.entity.js';

/**
 * `User.role`'s total ordering (planning/01-decisions.md, Runde 24):
 * `member < tenant_admin < server_admin`. Not exported — callers compare
 * roles through {@link requireRole}, never this map directly, so the
 * ranking itself can only ever be read, not accidentally relied on as
 * if it were part of the stored data.
 */
const ROLE_RANK: Readonly<Record<UserRole, number>> = {
  member: 0,
  tenant_admin: 1,
  server_admin: 2,
};

/**
 * Whether `user`'s `role` meets or exceeds `minimumRole` in the Admin
 * API's role hierarchy (M9, milestones/M9-admin-api/01-role-model/
 * 01-role-migration-and-retrofits.md) — `tenant_admin` satisfies a
 * `'tenant_admin'` minimum, and so does `server_admin` (a higher role
 * always satisfies a lower minimum), but `member` satisfies neither.
 *
 * Despite the `require*` name this project otherwise uses for an
 * assert-or-throw helper (`requireTenant`/`requirePrincipal` in
 * `dav-request.util.ts`), this one deliberately returns a plain
 * `boolean` instead: the Admin API's own authorization middleware
 * (`requireAdminRole`, `packages/admin-api`) always has to combine this
 * with an independent, unrelated check — whether `{tenantSlug}` in the
 * URL is even the `tenant_admin`'s own tenant — before it can decide on
 * a single `403`. A boolean composes into that combined condition
 * directly; a throw would need its own separate try/catch for a
 * question (role rank) that isn't the only thing being decided.
 *
 * Only compares rank — it has no opinion on *which* tenant `user`
 * belongs to, or which tenant the caller is trying to act on; that's
 * the middleware's own, separate concern.
 */
export function requireRole(user: User, minimumRole: UserRole): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[minimumRole];
}
