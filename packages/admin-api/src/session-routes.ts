import { Tenant, User, type DataSource } from '@davnode/core';
import type { Router } from 'express';
import { sendAdminError } from './admin-error-response.js';
import { requirePrincipal, requireTenant } from './admin-request.util.js';
import { requireAdminRole } from './require-admin-role.middleware.js';
import type { AdminRouterOptions } from './router.js';

/**
 * Registers the routes an admin UI needs to know who is talking to it and
 * what the server offers (M14 Große Aufgabe 1):
 *
 * - `GET /me` — the authenticated user, their role and tenant, plus the
 *   optional features this server has enabled. Open to *every* role
 *   (including `member`), so a client can tell "wrong credentials" (`401`)
 *   from "valid, but not an admin" (a `role` of `member`) without probing
 *   an admin-only route.
 * - `GET /providers` — which authentication providers the server runs.
 *   Read-only: providers come from the server configuration. Never
 *   contains secrets.
 */
export function registerSessionRoutes(
  router: Router,
  dataSource: DataSource,
  options: AdminRouterOptions = {},
): void {
  router.get('/me', async (req, res) => {
    const user = await dataSource
      .getRepository(User)
      .findOneBy({ principalId: requirePrincipal(req).id });
    const tenant = user
      ? await dataSource.getRepository(Tenant).findOneBy({ id: user.tenantId })
      : null;
    if (!user || !tenant) {
      sendAdminError(res, 403, 'no_user', 'The principal is not a user.');
      return;
    }
    res.json({
      id: user.id,
      principalId: user.principalId,
      username: user.username,
      email: user.email,
      role: user.role,
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      // The tenant the URL addresses; differs from `tenant` for a
      // server_admin who authenticates through another tenant's anchor.
      anchorTenant: requireTenant(req).slug,
      capabilities: { contentView: options.contentView === true },
    });
  });

  router.get(
    '/providers',
    requireAdminRole(dataSource, 'tenant_admin'),
    (_req, res) => {
      const enabled = new Set(options.authProviders ?? ['basic']);
      res.json({
        providers: (['basic', 'digest', 'oauth2'] as const).map((id) => ({
          id,
          enabled: enabled.has(id),
        })),
        oauth2Issuers: [...(options.oauth2Issuers ?? [])],
      });
    },
  );
}
