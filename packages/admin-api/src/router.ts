import type { DataSource } from '@davnode/core';
import express, { type Router } from 'express';
import { adminErrorHandler } from './admin-error-handler.middleware.js';
import { registerGroupRoutes } from './group-routes.js';
import { registerMetricsRoute, type MetricsSource } from './metrics-routes.js';
import { registerQuotaRoutes } from './quota-routes.js';
import { registerSessionRoutes } from './session-routes.js';
import { registerTenantRoutes } from './tenant-routes.js';
import { registerUserRoutes } from './user-routes.js';

/** Options for {@link createAdminRouter}. */
export interface AdminRouterOptions {
  /**
   * The server's Digest realm when Digest auth is enabled (M10). Passed
   * to `UserService` so user creation and password resets also maintain
   * the `digest` credential; leave unset when Digest is disabled.
   */
  digestRealm?: string;
  /**
   * The `iss` values of the OIDC issuers the server trusts (M10). An
   * OAuth2 identity can only be linked to a user for one of these; empty
   * or unset means OAuth2 is not enabled and linking is refused.
   */
  oauth2Issuers?: readonly string[];
  /** The server's metrics; without them `GET /metrics` does not exist. */
  metrics?: MetricsSource;
  /**
   * The enabled authentication providers (`basic`, `digest`, `oauth2`),
   * reported by `GET /providers`. Defaults to `['basic']`.
   */
  authProviders?: readonly string[];
  /**
   * Whether the read-only calendar/contact inspection routes (M14) exist.
   * Off by default: they let admins read other users' data.
   */
  contentView?: boolean;
}

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
 * @param options - See {@link AdminRouterOptions}.
 */
export function createAdminRouter(
  dataSource: DataSource,
  options: AdminRouterOptions = {},
): Router {
  const router = express.Router();

  // Große Aufgaben 3-6 add their own registerXRoutes(router,
  // dataSource) calls here, in that order, mirroring server/app.ts's
  // own registration pattern.
  registerSessionRoutes(router, dataSource, options);
  registerTenantRoutes(router, dataSource);
  registerUserRoutes(router, dataSource, options);
  registerGroupRoutes(router, dataSource);
  registerQuotaRoutes(router, dataSource);
  if (options.metrics) {
    registerMetricsRoute(router, dataSource, options.metrics);
  }

  // Must be the last middleware added to this router — see its own doc
  // comment for why.
  router.use(adminErrorHandler);

  return router;
}
