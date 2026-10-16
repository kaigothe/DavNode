import { TenantService, type DataSource, type Tenant } from '@davnode/core';
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

/** The JSON representation of a tenant in Admin API responses. */
function toTenantBody(tenant: Tenant) {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    quotaLimitBytes: tenant.quotaLimitBytes,
    quotaUsedBytes: tenant.quotaUsedBytes,
    createdAt: tenant.createdAt.toISOString(),
  };
}

/** Slugs end up in URL paths: lowercase alphanumerics and inner hyphens only. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 63;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/** `null` (no limit) or a non-negative safe integer. */
const isQuotaLimit = (value: unknown): value is number | null =>
  value === null || (Number.isSafeInteger(value) && (value as number) >= 0);

/**
 * Registers the tenant-management routes (M9 Große Aufgabe 3) on the
 * Admin API router. Every route is `server_admin`-only; `{tenantSlug}`
 * in the URL is merely the requester's auth anchor, while the operation
 * targets `{targetSlug}`.
 *
 * - `POST /tenants`, `GET /tenants`, `GET /tenants/{targetSlug}`,
 *   `PATCH /tenants/{targetSlug}` (`name`, `quotaLimitBytes`) —
 *   milestones/M9-admin-api/03-tenant-management/01-tenant-crud.md.
 *   Because only a `server_admin` reaches `PATCH`, a tenant can never
 *   raise its own quota limit.
 * - `DELETE /tenants/{targetSlug}` (02-tenant-deletion.md). The body must repeat the
 * slug (`{ "confirmSlug": "..." }`) — anything else answers `400` and
 * deletes nothing. The deletion itself is a single `DELETE` that the
 * database cascades through the tenant's whole row graph.
 */
export function registerTenantRoutes(
  router: Router,
  dataSource: DataSource,
): void {
  const tenants = new TenantService(dataSource);

  const serverAdmin = requireAdminRole(dataSource, 'server_admin');

  router.post('/tenants', serverAdmin, parseJsonBody, async (req, res) => {
    const { slug, name, quotaLimitBytes } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    if (
      typeof slug !== 'string' ||
      slug.length > MAX_SLUG_LENGTH ||
      !SLUG_PATTERN.test(slug)
    ) {
      sendAdminError(
        res,
        400,
        'invalid_slug',
        '"slug" must be lowercase letters, digits and inner hyphens (max 63 characters).',
      );
      return;
    }
    if (!isNonEmptyString(name)) {
      sendAdminError(
        res,
        400,
        'invalid_name',
        '"name" must be a non-empty string.',
      );
      return;
    }
    if (quotaLimitBytes !== undefined && !isQuotaLimit(quotaLimitBytes)) {
      sendAdminError(
        res,
        400,
        'invalid_quota',
        '"quotaLimitBytes" must be null or a non-negative integer.',
      );
      return;
    }

    const tenant = await tenants.createTenant({ slug, name, quotaLimitBytes });
    res.status(201).json(toTenantBody(tenant));
  });

  router.get('/tenants', serverAdmin, async (_req, res) => {
    const all = await tenants.listTenants();
    res.json({ tenants: all.map(toTenantBody) });
  });

  router.get('/tenants/:targetSlug', serverAdmin, async (req, res) => {
    const target = await tenants.findTenantBySlug(
      String(req.params['targetSlug']),
    );
    if (!target) {
      sendAdminError(res, 404, 'tenant_not_found', 'Tenant not found.');
      return;
    }
    res.json(toTenantBody(target));
  });

  router.patch(
    '/tenants/:targetSlug',
    serverAdmin,
    parseJsonBody,
    async (req, res) => {
      const { name, quotaLimitBytes } = (req.body ?? {}) as Record<
        string,
        unknown
      >;
      if (name !== undefined && !isNonEmptyString(name)) {
        sendAdminError(
          res,
          400,
          'invalid_name',
          '"name" must be a non-empty string.',
        );
        return;
      }
      if (quotaLimitBytes !== undefined && !isQuotaLimit(quotaLimitBytes)) {
        sendAdminError(
          res,
          400,
          'invalid_quota',
          '"quotaLimitBytes" must be null or a non-negative integer.',
        );
        return;
      }

      const target = await tenants.findTenantBySlug(
        String(req.params['targetSlug']),
      );
      if (!target) {
        sendAdminError(res, 404, 'tenant_not_found', 'Tenant not found.');
        return;
      }
      const updated = await tenants.updateTenant(target.id, {
        name,
        quotaLimitBytes,
      });
      res.json(toTenantBody(updated));
    },
  );

  router.delete(
    '/tenants/:targetSlug',
    serverAdmin,
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
