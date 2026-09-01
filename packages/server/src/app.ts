import type { DataSource } from '@davnode/core';
import express from 'express';
import { createBasicAuthMiddleware } from './http/basic-auth.middleware.js';
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
  // are only unique per tenant. Route mounting for specific resource
  // types (/files/, and later /calendars//addressbooks/) happens in
  // later milestones' sub-tasks; this app has no routes of its own yet,
  // so any authenticated request just gets Express's own default 404.
  app.use('/dav/:tenantSlug', createTenantResolutionMiddleware(dataSource));
  app.use('/dav/:tenantSlug', createBasicAuthMiddleware(dataSource));

  return app;
}
