import { TenantService, type DataSource } from '@davnode/core';
import type { RequestHandler } from 'express';

/** Route params expected by the middleware {@link createTenantResolutionMiddleware} returns. */
interface TenantSlugParams {
  tenantSlug: string;
}

/**
 * Creates the tenant-resolution middleware: reads the `{tenantSlug}` URL
 * segment (`/dav/{tenantSlug}/...`, path-prefix tenancy) from
 * `req.params.tenantSlug`, loads the matching `Tenant` via
 * {@link TenantService.findTenantBySlug}, and attaches it as `req.tenant`
 * (see `express.d.ts` for the type augmentation).
 *
 * Responds with `404 Not Found` for an unknown slug — deliberately not
 * `403`, so as not to reveal whether a slug is reserved at all, standard
 * practice for multi-tenant systems — before any auth or resource logic
 * runs. Mount this before any other DAV middleware/routes, using a route
 * path that captures the slug as `:tenantSlug`
 * (e.g. `app.use('/dav/:tenantSlug', createTenantResolutionMiddleware(dataSource))`).
 * Makes no assumptions about what the URL contains after the tenant
 * segment, so the same mounting works for `/files/`, and later
 * `/calendars/`/`/addressbooks/` (M5/M6).
 *
 * @param dataSource - An initialized DataSource to look tenants up in.
 */
export function createTenantResolutionMiddleware(
  dataSource: DataSource,
): RequestHandler<TenantSlugParams> {
  const tenantService = new TenantService(dataSource);

  return async (req, res, next): Promise<void> => {
    const tenant = await tenantService.findTenantBySlug(req.params.tenantSlug);
    if (!tenant) {
      res.sendStatus(404);
      return;
    }
    req.tenant = tenant;
    next();
  };
}
