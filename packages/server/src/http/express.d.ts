import type { Principal, Tenant } from '@davnode/core';

declare global {
  namespace Express {
    interface Request {
      /**
       * The tenant resolved from the `{tenantSlug}` URL segment, set by
       * the tenant-resolution middleware. `undefined` for any request
       * that middleware hasn't run on.
       */
      tenant?: Tenant;

      /**
       * The principal authenticated by the basic-auth middleware.
       * `undefined` for any request that middleware hasn't run on (or
       * that failed authentication, since the response is sent directly
       * and never reaches a downstream handler in that case).
       */
      principal?: Principal;
    }
  }
}
