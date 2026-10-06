import type { DataSource } from '@davnode/core';
import express, { type Router } from 'express';
import { adminErrorHandler } from './admin-error-handler.middleware.js';

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
 * register their own routes onto this same router — none exist yet, so
 * for now this is just the skeleton: an empty router plus the shared
 * `adminErrorHandler`.
 *
 * @param _dataSource - Not yet used by this Große Aufgabe's own code,
 * but every later one's route registrations will need it — kept in the
 * signature from the start rather than added as a breaking change once
 * the first real route needs it, mirroring `server`'s own
 * `createApp(dataSource)`.
 */
export function createAdminRouter(_dataSource: DataSource): Router {
  const router = express.Router();

  // Große Aufgaben 3-6 will add their own registerXRoutes(router,
  // dataSource) calls here, in that order, mirroring server/app.ts's
  // own registration pattern.

  // Must be the last middleware added to this router — see its own doc
  // comment for why.
  router.use(adminErrorHandler);

  return router;
}
