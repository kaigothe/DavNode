/** Current version of the `@davnode/admin-api` package. */
export const VERSION = '0.0.1';

export { createAdminRouter } from './router.js';
export { sendAdminError, type AdminErrorBody } from './admin-error-response.js';
export { adminErrorHandler } from './admin-error-handler.middleware.js';
export { requirePrincipal, requireTenant } from './admin-request.util.js';
export { requireAdminRole } from './require-admin-role.middleware.js';
