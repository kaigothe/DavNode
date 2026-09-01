import type { DataSource } from '@davnode/core';
import express from 'express';
import { createBasicAuthMiddleware } from './http/basic-auth.middleware.js';
import { errorHandlerMiddleware } from './http/error-handler.middleware.js';
import { registerCopyRoute } from './http/routes/copy.route.js';
import { registerDeleteRoute } from './http/routes/delete.route.js';
import { registerGetRoute } from './http/routes/get.route.js';
import { registerMkcolRoute } from './http/routes/mkcol.route.js';
import { registerMoveRoute } from './http/routes/move.route.js';
import { registerPropfindRoute } from './http/routes/propfind.route.js';
import { registerProppatchRoute } from './http/routes/proppatch.route.js';
import { registerPutRoute } from './http/routes/put.route.js';
import { createTenantResolutionMiddleware } from './http/tenant-resolution.middleware.js';

/**
 * Creates the Express application, without starting it. Keeping app
 * construction separate from `.listen()` keeps the app importable and
 * testable (e.g. with a request-testing library) without ever binding a
 * port.
 *
 * @param dataSource - An initialized DataSource, used to build the
 * services this app's middleware/routes need.
 */
export function createApp(dataSource: DataSource): express.Express {
  const app = express();

  // Every DAV route lives under /dav/{tenantSlug}/... (path-prefix
  // tenancy) and needs the resolved Tenant before anything else runs —
  // including the auth middleware mounted right after, since usernames
  // are only unique per tenant.
  app.use('/dav/:tenantSlug', createTenantResolutionMiddleware(dataSource));
  app.use('/dav/:tenantSlug', createBasicAuthMiddleware(dataSource));

  // Owner-only authorization (the M2 placeholder for M3's ACL engine) is
  // applied per-route rather than globally here: each DAV route supplies
  // its own resolver for "what resource does this request target" — see
  // createOwnerOnlyAuthorizationMiddleware. COPY (and MOVE) are the
  // exception: they check two resources (source and destination parent),
  // which that single-resolver middleware isn't shaped for, so they do
  // the same ownership check inline instead — see copy.route.ts.
  registerPropfindRoute(app, dataSource);
  registerProppatchRoute(app, dataSource);
  registerMkcolRoute(app, dataSource);
  registerGetRoute(app, dataSource);
  registerPutRoute(app, dataSource);
  registerDeleteRoute(app, dataSource);
  registerCopyRoute(app, dataSource);
  registerMoveRoute(app, dataSource);

  // Must stay last: Express only treats a 4-argument middleware as an
  // error handler, and only for errors from middleware/routes mounted
  // before it.
  app.use(errorHandlerMiddleware);

  return app;
}
