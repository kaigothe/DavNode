import {
  DAV_NAMESPACE,
  PrincipalPropertySearchReportHandler,
  ReportRegistry,
  type DataSource,
} from '@davnode/core';
import express from 'express';
import { createBasicAuthMiddleware } from './http/basic-auth.middleware.js';
import { errorHandlerMiddleware } from './http/error-handler.middleware.js';
import { registerAclRoute } from './http/routes/acl.route.js';
import { registerCopyRoute } from './http/routes/copy.route.js';
import { registerDeleteRoute } from './http/routes/delete.route.js';
import { registerGetRoute } from './http/routes/get.route.js';
import { registerLockRoute } from './http/routes/lock.route.js';
import { registerMkcolRoute } from './http/routes/mkcol.route.js';
import { registerMoveRoute } from './http/routes/move.route.js';
import { registerPrincipalsRoute } from './http/routes/principals.route.js';
import { registerPropfindRoute } from './http/routes/propfind.route.js';
import { registerProppatchRoute } from './http/routes/proppatch.route.js';
import { registerPutRoute } from './http/routes/put.route.js';
import { registerReportRoute } from './http/routes/report.route.js';
import { registerUnlockRoute } from './http/routes/unlock.route.js';
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

  // ACL authorization (the real RFC 3744 evaluation engine, replacing
  // M2's owner-only placeholder — milestones/M3-webdav-acl/
  // 07-replace-placeholder-authorization) is applied per-route rather
  // than globally here: each DAV route supplies its own resolver for
  // "what resource, and which privilege, does this request need" — see
  // createAclAuthorizationMiddleware. COPY and MOVE are the exception:
  // they check two resources (source and destination parent), which
  // that single-resolver middleware isn't shaped for, so they run
  // hasPrivilege inline instead — see copy.route.ts/move.route.ts.
  registerPropfindRoute(app, dataSource);
  registerProppatchRoute(app, dataSource);
  registerMkcolRoute(app, dataSource);
  registerGetRoute(app, dataSource);
  registerPutRoute(app, dataSource);
  registerDeleteRoute(app, dataSource);
  registerCopyRoute(app, dataSource);
  registerMoveRoute(app, dataSource);
  registerAclRoute(app, dataSource);
  registerLockRoute(app, dataSource);
  registerUnlockRoute(app, dataSource);
  registerPrincipalsRoute(app, dataSource);

  // REPORT handlers register themselves into this registry — see
  // report.route.ts.
  const reportRegistry = new ReportRegistry();
  reportRegistry.register(
    DAV_NAMESPACE,
    'principal-property-search',
    new PrincipalPropertySearchReportHandler(),
  );
  registerReportRoute(app, dataSource, reportRegistry);

  // Must stay last: Express only treats a 4-argument middleware as an
  // error handler, and only for errors from middleware/routes mounted
  // before it.
  app.use(errorHandlerMiddleware);

  return app;
}
