import {
  recomputeQuotaForTenant,
  Tenant,
  User,
  type DataSource,
} from '@davnode/core';
import type { Express, Request, Response } from 'express';
import { requirePrincipal, requireTenant } from './dav-request.util.js';

/**
 * Registers `POST /dav/{tenantSlug}/admin/quota/recompute`
 * (`milestones/M8-quota/05-quota-recompute/02-manual-trigger-endpoint.md`):
 * a manually-triggered, synchronous run of `recomputeQuotaForTenant`
 * for the tenant in the URL — the same function the in-process cron job
 * (`quota-reconciliation-cron.ts`) calls periodically — answering with
 * every updated counter.
 *
 * **Authorization**: requires the requesting principal's own `User.role`
 * to be `'tenant_admin'` or `'server_admin'`, else `403`. The sub-task's
 * own doc describes this as a brand-new `User.isAdmin` placeholder
 * boolean (Runde 23) — but by the time this Große Aufgabe was actually
 * built, `User.role` already carried Runde 24's real
 * `'member' | 'tenant_admin' | 'server_admin'` values (see
 * `cli/bootstrap.ts`, which has set `role: 'server_admin'` on a tenant's
 * first user since M1). Per that sub-task's own Nachtrag — "wird die
 * Roadmap linear umgesetzt, kann dieser Übergangs-Endpunkt übersprungen
 * und direkt der M9-Endpunkt gebaut werden" — the real `role` check is
 * used directly instead, with no `isAdmin` column ever added and no
 * `// TODO(M9)` needed: there is nothing left for M9 to replace here.
 *
 * Still a pragmatic placeholder in the sense the sub-task intends: a
 * plain Basic-Auth-protected DAV-adjacent route, not a real Admin API
 * (M9) with its own permission model — `{tenantSlug}` in the URL is the
 * requester's own tenant (resolved by the same tenant-resolution
 * middleware every other route uses), so a `tenant_admin` can only ever
 * reconcile their own tenant through this endpoint regardless of what a
 * `server_admin`'s role might allow elsewhere.
 *
 * Responds `200` with the tenant's own new `quotaUsedBytes` and every
 * one of its users' new `quotaUsedBytes`, read back after
 * `recomputeQuotaForTenant` commits.
 */
export function registerQuotaRecomputeRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.post(
    '/dav/:tenantSlug/admin/quota/recompute',
    async (req: Request, res: Response): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);

      const requester = await dataSource
        .getRepository(User)
        .findOneBy({ principalId: principal.id });
      if (
        !requester ||
        (requester.role !== 'tenant_admin' && requester.role !== 'server_admin')
      ) {
        res.sendStatus(403);
        return;
      }

      await recomputeQuotaForTenant(dataSource, tenant.id);

      const updatedTenant = await dataSource
        .getRepository(Tenant)
        .findOneByOrFail({ id: tenant.id });
      const updatedUsers = await dataSource
        .getRepository(User)
        .findBy({ tenantId: tenant.id });

      res.status(200).json({
        tenant: {
          id: updatedTenant.id,
          quotaUsedBytes: updatedTenant.quotaUsedBytes,
        },
        users: updatedUsers.map((user) => ({
          id: user.id,
          quotaUsedBytes: user.quotaUsedBytes,
        })),
      });
    },
  );
}
