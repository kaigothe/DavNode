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

/**
 * `@types/express-serve-static-core` already declares most WebDAV
 * extension methods (`mkcol`, `propfind`, `proppatch`, `copy`, `move`,
 * ...) on `IRouter` — Express itself derives its method list from
 * Node's `http.METHODS`, which does include `ACL`, but that particular
 * one is missing from the `@types` package's otherwise-thorough list.
 * Adding it here (rather than casting `app` at each call site) keeps
 * `app.acl(...)` (`acl.route.ts`) as fully typed as every other DAV
 * route registration.
 */
declare module 'express-serve-static-core' {
  interface IRouter {
    acl: IRouterMatcher<this>;
  }
}
