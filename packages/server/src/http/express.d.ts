import type { Tenant } from '@davnode/core';

declare global {
  namespace Express {
    interface Request {
      /**
       * The tenant resolved from the `{tenantSlug}` URL segment, set by
       * the tenant-resolution middleware. `undefined` for any request
       * that middleware hasn't run on.
       */
      tenant?: Tenant;
    }
  }
}
