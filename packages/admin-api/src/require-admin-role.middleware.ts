import { requireRole, User, type DataSource } from '@davnode/core';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { sendAdminError } from './admin-error-response.js';
import { requirePrincipal, requireTenant } from './admin-request.util.js';

/**
 * Express middleware factory authorizing an Admin API request purely by
 * `User.role` (M9, milestones/M9-admin-api/02-admin-api-scaffold/
 * 02-authorization-middleware.md) — deliberately **not** the WebDAV
 * ACL engine (M3): admin operations (create a user, delete a tenant,
 * ...) aren't DAV resource accesses, and no ACE table has an opinion on
 * them.
 *
 * `minimumRole` draws the line between the two shapes M9's own routes
 * come in:
 *
 * - **Tenant-management routes** (Große Aufgabe 3): `{tenantSlug}` in
 *   the URL is only the requester's own auth anchor, unrelated to which
 *   tenant the operation targets (`00-setting-goal.md`) — pass
 *   `'server_admin'` here, since that's the only role allowed through
 *   at all, and a `server_admin` is exempt from the tenant-match check
 *   below by definition (RFC — Runde 24 — grants them every tenant).
 * - **User-/Group-/Quota-management routes** (Große Aufgaben 4–6):
 *   `{tenantSlug}` *is* the target tenant — pass `'tenant_admin'`, which
 *   lets both ranks through the role check, but then requires a
 *   `tenant_admin` (never a `server_admin`, who's exempt) to be
 *   managing their *own* tenant, rejecting a mismatch with `403`.
 *
 * Both failure modes answer `403` with the shared JSON error envelope:
 * `insufficient_role` for a rank that's too low outright, `wrong_tenant`
 * for a `tenant_admin` whose own tenant doesn't match the URL's.
 *
 * Assumes `req.tenant`/`req.principal` are already set (this router's
 * own contract, `router.ts`) — never resolves either itself.
 */
export function requireAdminRole(
  dataSource: DataSource,
  minimumRole: 'tenant_admin' | 'server_admin',
): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const tenant = requireTenant(req);
    const principal = requirePrincipal(req);

    const user = await dataSource
      .getRepository(User)
      .findOneBy({ principalId: principal.id });
    if (!user || !requireRole(user, minimumRole)) {
      sendAdminError(
        res,
        403,
        'insufficient_role',
        `This operation requires at least the "${minimumRole}" role.`,
      );
      return;
    }

    if (user.role === 'tenant_admin' && user.tenantId !== tenant.id) {
      sendAdminError(
        res,
        403,
        'wrong_tenant',
        'A tenant_admin may only manage their own tenant.',
      );
      return;
    }

    next();
  };
}
