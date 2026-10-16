import { TenantService, type DataSource } from '@davnode/core';
import express, { type RequestHandler, type Router } from 'express';
import { sendAdminError } from './admin-error-response.js';
import { requireAdminRole } from './require-admin-role.middleware.js';

/**
 * Parses a JSON request body, answering a malformed one with the shared
 * `400` error envelope instead of letting `express.json()`'s raw
 * `SyntaxError` fall through to the generic `500` handler.
 */
const parseJsonBody: RequestHandler = (req, res, next) => {
  express.json()(req, res, (error?: unknown) => {
    if (error) {
      sendAdminError(
        res,
        400,
        'invalid_body',
        'The request body is not valid JSON.',
      );
      return;
    }
    next();
  });
};

/**
 * Registers the tenant-management routes (M9 Große Aufgabe 3) on the
 * Admin API router. Every route is `server_admin`-only; `{tenantSlug}`
 * in the URL is merely the requester's auth anchor, while the operation
 * targets `{targetSlug}`.
 *
 * Currently: `DELETE /tenants/{targetSlug}` (milestones/M9-admin-api/
 * 03-tenant-management/02-tenant-deletion.md). The body must repeat the
 * slug (`{ "confirmSlug": "..." }`) — anything else answers `400` and
 * deletes nothing. The deletion itself is a single `DELETE` that the
 * database cascades through the tenant's whole row graph.
 */
export function registerTenantRoutes(
  router: Router,
  dataSource: DataSource,
): void {
  const tenants = new TenantService(dataSource);

  router.delete(
    '/tenants/:targetSlug',
    requireAdminRole(dataSource, 'server_admin'),
    parseJsonBody,
    async (req, res) => {
      const targetSlug = req.params['targetSlug'];
      const confirmSlug = (req.body as { confirmSlug?: unknown } | undefined)
        ?.confirmSlug;
      if (typeof confirmSlug !== 'string' || confirmSlug !== targetSlug) {
        sendAdminError(
          res,
          400,
          'confirmation_mismatch',
          'The request body must contain a "confirmSlug" equal to the slug of the tenant to delete.',
        );
        return;
      }

      const target = await tenants.findTenantBySlug(confirmSlug);
      if (!target) {
        sendAdminError(
          res,
          404,
          'tenant_not_found',
          `Tenant "${confirmSlug}" not found.`,
        );
        return;
      }

      await tenants.deleteTenant(target.id);
      res.status(204).end();
    },
  );
}
