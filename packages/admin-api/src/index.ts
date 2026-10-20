/** Current version of the `@davnode/admin-api` package. */
export const VERSION = '0.0.1';

export { createAdminRouter, type AdminRouterOptions } from './router.js';
export type { ContentAccess } from './content-routes.js';
export type { LogEntryBody, LogSource } from './logs-routes.js';
export type { MetricsSource } from './metrics-routes.js';
export { sendAdminError, type AdminErrorBody } from './admin-error-response.js';
export { adminErrorHandler } from './admin-error-handler.middleware.js';
export { requirePrincipal, requireTenant } from './admin-request.util.js';
export { requireAdminRole } from './require-admin-role.middleware.js';
