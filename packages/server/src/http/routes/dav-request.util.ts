import type { Principal, Tenant } from '@davnode/core';
import type { Request } from 'express';

/**
 * Path segments after `/files`, from a route's `{/*splat}` wildcard.
 * Express 5's types still describe every route param as `string` (a
 * known gap for wildcard captures — path-to-regexp v8 actually returns
 * an array), so this reads `req.params.splat` untyped rather than via
 * a `Request<...>` generic that would just assert the wrong shape.
 */
export function pathSegments(req: Request): string[] {
  const splat: unknown = (req.params as Record<string, unknown>).splat;
  return Array.isArray(splat) ? (splat as string[]) : [];
}

/**
 * `req.tenant`, guaranteed set by this point on every `/dav/:tenantSlug`
 * route (tenant-resolution and basic-auth both run first and both
 * require it — see `tenant-resolution.middleware.ts`/
 * `basic-auth.middleware.ts`).
 *
 * @throws An `Error` if `req.tenant` isn't set — a misconfiguration
 * (wrong mounting order), not a client-facing condition.
 */
export function requireTenant(req: Request): Tenant {
  if (!req.tenant) {
    throw new Error(
      'This route requires the tenant-resolution middleware to run first (req.tenant is not set)',
    );
  }
  return req.tenant;
}

/**
 * `req.principal`, guaranteed set by this point on every
 * `/dav/:tenantSlug` route (basic-auth runs first and requires it — see
 * `basic-auth.middleware.ts`).
 *
 * @throws An `Error` if `req.principal` isn't set — a misconfiguration
 * (wrong mounting order), not a client-facing condition.
 */
export function requirePrincipal(req: Request): Principal {
  if (!req.principal) {
    throw new Error(
      'This route requires the basic-auth middleware to run first (req.principal is not set)',
    );
  }
  return req.principal;
}
