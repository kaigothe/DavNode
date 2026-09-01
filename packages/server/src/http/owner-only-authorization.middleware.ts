import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * The minimal shape this middleware needs to check ownership: any
 * loaded entity with an `ownerPrincipalId` (currently `Collection` or
 * `FileResource` from `@davnode/core`).
 */
export interface OwnedResource {
  ownerPrincipalId: string;
}

/**
 * Loads the resource a request's owner-only check should apply to.
 *
 * For a request operating on an existing resource (GET, PUT onto an
 * existing path, DELETE, PROPFIND, PROPPATCH, a COPY/MOVE source, ...)
 * return that resource itself. For a request that creates a new
 * resource (MKCOL, PUT onto a path that doesn't exist yet) return the
 * *parent* collection instead — ownership of a not-yet-existing path is
 * meaningless, but creating something inside a collection is exactly
 * what "owns the parent" should gate.
 *
 * Return `null` if neither the target nor its parent exists. This
 * middleware treats that as "nothing to authorize" and calls `next()`
 * unconditionally — the route handler is in a better position to tell
 * "target missing" (404) apart from "parent also missing" (409), so
 * this middleware doesn't guess.
 */
export type OwnedResourceResolver = (
  req: Request,
) => Promise<OwnedResource | null>;

/**
 * Creates the **placeholder** authorization middleware used until M3's
 * ACL engine (RFC 3744) replaces it: a request is allowed only if the
 * requesting principal owns the target resource (or, for a
 * not-yet-existing target, its parent collection — see
 * {@link OwnedResourceResolver}). See
 * `milestones/M2-webdav-core/00-setting-goal.md` for why this is a
 * safe interim rule rather than a security gap: every request is still
 * checked, just against a coarser rule than full ACE evaluation.
 *
 * **Replace when building M3**: swap each route's use of this
 * middleware for the real ACL-evaluation middleware; this file's logic
 * (and, eventually, this file itself) becomes obsolete.
 *
 * Must run after the basic-auth middleware, since the check needs
 * `req.principal`. Each DAV route mounts its own instance with a
 * resolver that knows how to load *that* route's target resource —
 * there's no single generic way to do it, since MKCOL/PUT (parent
 * collection) and GET/DELETE/PROPFIND (the resource itself) resolve
 * differently.
 *
 * @param resolveResource - See {@link OwnedResourceResolver}.
 * @throws An `Error` if `req.principal` isn't set when a request
 * reaches this middleware — a misconfiguration (wrong mounting order),
 * not a client-facing condition.
 */
export function createOwnerOnlyAuthorizationMiddleware(
  resolveResource: OwnedResourceResolver,
): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.principal) {
      throw new Error(
        'owner-only-authorization middleware requires the basic-auth middleware to run first (req.principal is not set)',
      );
    }

    const resource = await resolveResource(req);
    if (!resource) {
      next();
      return;
    }

    if (resource.ownerPrincipalId !== req.principal.id) {
      res.sendStatus(403);
      return;
    }

    next();
  };
}
