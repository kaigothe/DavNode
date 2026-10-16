import type { DataSource } from '@davnode/core';
import express, { type Router } from 'express';
import { adminErrorHandler } from './admin-error-handler.middleware.js';
import { registerTenantRoutes } from './tenant-routes.js';
import { registerUserRoutes } from './user-routes.js';

/**
 * Builds the `/admin` Express `Router` (M9, planning/04-architecture.md:
 * "`admin-api` exportiert einen Express-Router ... `server` bindet ihn
 * in `app.ts` unter `/admin` in denselben Prozess ein"). `server` mounts
 * this on `/admin/:tenantSlug`, after the *same* tenant-resolution and
 * Basic-Auth middleware instances the DAV routes already run through —
 * this package never resolves a tenant or authenticates a request
 * itself (`admin-request.util.ts`'s `requireTenant`/`requirePrincipal`
 * just assert that contract, throwing on a misconfiguration rather than
 * trying to handle it).
 *
 * Große Aufgaben 3–6 (Tenant-/User-/Group-/Quota-Management) each
 * register their own routes onto this same router; so far only the
 * tenant routes exist (`tenant-routes.ts`).
 *
 * @param dataSource - Handed to every route registration, mirroring
 * `server`'s own `createApp(dataSource)`.
 */
export function createAdminRouter(dataSource: DataSource): Router {
  const router = express.Router();

  // Große Aufgaben 3-6 add their own registerXRoutes(router,
  // dataSource) calls here, in that order, mirroring server/app.ts's
  // own registration pattern.
  registerTenantRoutes(router, dataSource);
  registerUserRoutes(router, dataSource);

  // Must be the last middleware added to this router — see its own doc
  // comment for why.
  router.use(adminErrorHandler);

  return router;
}
