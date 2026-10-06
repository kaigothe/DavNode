import type { Principal, Tenant } from '@davnode/core';
import type { Request } from 'express';

/**
 * `req.tenant`, guaranteed set by `server`'s tenant-resolution
 * middleware before this router is ever reached (`router.ts`'s own
 * contract — this package never resolves a tenant itself).
 *
 * @throws An `Error` if `req.tenant` isn't set — a misconfiguration
 * (wrong mounting order in `server`), not a client-facing condition.
 */
export function requireTenant(req: Request): Tenant {
  if (!req.tenant) {
    throw new Error(
      'This route requires the tenant-resolution middleware to run first (req.tenant is not set).',
    );
  }
  return req.tenant;
}

/**
 * `req.principal`, guaranteed set by `server`'s Basic-Auth middleware
 * before this router is ever reached (`router.ts`'s own contract —
 * this package never authenticates a request itself).
 *
 * @throws An `Error` if `req.principal` isn't set — a misconfiguration
 * (wrong mounting order in `server`), not a client-facing condition.
 */
export function requirePrincipal(req: Request): Principal {
  if (!req.principal) {
    throw new Error(
      'This route requires the Basic-Auth middleware to run first (req.principal is not set).',
    );
  }
  return req.principal;
}
