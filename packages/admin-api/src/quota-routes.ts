import {
  recomputeQuotaForTenant,
  Tenant,
  TenantService,
  UserService,
  type DataSource,
} from '@davnode/core';
import type { Router } from 'express';
import { sendAdminError } from './admin-error-response.js';
import { requireTenant } from './admin-request.util.js';
import { isQuotaLimit, parseJsonBody } from './request-body.util.js';
import { requireAdminRole } from './require-admin-role.middleware.js';

/**
 * Registers the quota-management routes (M9 Große Aufgabe 6) on the
 * Admin API router; they replace M8's interim
 * `POST /dav/{tenantSlug}/admin/quota/recompute`.
 *
 * - `GET /quota`: the managed tenant's limit/usage plus every user's.
 * - `PATCH /quota`: sets the tenant's `quotaLimitBytes` — `server_admin`
 *   only, so a tenant can never raise its own limit. User limits are
 *   maintained through `PATCH /users/{id}` instead.
 * - `POST /quota/recompute`: runs `recomputeQuotaForTenant` synchronously
 *   and answers with the corrected figures (same body as `GET`).
 *
 * `GET` and `POST` are open to `tenant_admin` (own tenant) and
 * `server_admin` (any tenant).
 */
export function registerQuotaRoutes(
  router: Router,
  dataSource: DataSource,
): void {
  const tenants = new TenantService(dataSource);
  const users = new UserService(dataSource);
  const tenantAdmin = requireAdminRole(dataSource, 'tenant_admin');

  /** Reads the managed tenant's current figures fresh from the database. */
  async function quotaOverview(tenantId: string) {
    const tenant = await dataSource
      .getRepository(Tenant)
      .findOneByOrFail({ id: tenantId });
    return {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        quotaLimitBytes: tenant.quotaLimitBytes,
        quotaUsedBytes: tenant.quotaUsedBytes,
      },
      users: (await users.listUsers(tenantId)).map((user) => ({
        id: user.id,
        username: user.username,
        quotaLimitBytes: user.quotaLimitBytes,
        quotaUsedBytes: user.quotaUsedBytes,
      })),
    };
  }

  router.get('/quota', tenantAdmin, async (req, res) => {
    res.json(await quotaOverview(requireTenant(req).id));
  });

  router.patch(
    '/quota',
    requireAdminRole(dataSource, 'server_admin'),
    parseJsonBody,
    async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (
        !('quotaLimitBytes' in body) ||
        !isQuotaLimit(body['quotaLimitBytes'])
      ) {
        sendAdminError(
          res,
          400,
          'invalid_quota',
          '"quotaLimitBytes" is required and must be null or a non-negative integer.',
        );
        return;
      }

      const tenantId = requireTenant(req).id;
      await tenants.updateTenant(tenantId, {
        quotaLimitBytes: body['quotaLimitBytes'],
      });
      res.json(await quotaOverview(tenantId));
    },
  );

  router.post('/quota/recompute', tenantAdmin, async (req, res) => {
    const tenantId = requireTenant(req).id;
    await recomputeQuotaForTenant(dataSource, tenantId);
    res.json(await quotaOverview(tenantId));
  });
}
