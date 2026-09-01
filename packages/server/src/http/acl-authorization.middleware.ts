import { hasPrivilege, type DataSource, type Privilege, type WebDavTreeResource } from '@davnode/core';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * What {@link createAclAuthorizationMiddleware} needs to run one
 * privilege check: which resource, and which privilege RFC 3744 §7
 * requires on it for the request's method.
 */
export interface AclCheck {
  resource: WebDavTreeResource;
  privilege: Privilege;
}

/**
 * Resolves the {@link AclCheck} a request needs, or `null` if there's
 * nothing to authorize yet — the route handler is better positioned to
 * produce the right `404`/`409` in that case (e.g. a missing parent
 * collection). Same "return `null` to skip" contract the M2 owner-only
 * placeholder's resolver used.
 */
export type AclCheckResolver = (req: Request) => Promise<AclCheck | null>;

/**
 * Creates the real RFC 3744 ACL-evaluation authorization middleware,
 * replacing M2's owner-only placeholder
 * (`milestones/M3-webdav-acl/07-replace-placeholder-authorization`).
 *
 * Which resource and which privilege (RFC 3744 §7) a request needs
 * varies by HTTP method — sometimes even by outcome within one method
 * (PUT checks `write-content` on the target when overwriting, but
 * `bind` on the parent collection when creating) — so each DAV route
 * supplies its own {@link AclCheckResolver} rather than this middleware
 * trying to guess from the request alone. COPY and MOVE check two
 * resources (source and destination parent) and do so inline instead of
 * through this middleware, the same exception the M2 placeholder had.
 *
 * Must run after the basic-auth middleware, since the check needs
 * `req.principal`.
 *
 * @param dataSource - Used to run the privilege check (a plain read,
 * not wrapped in a transaction — nothing here writes).
 * @param resolveCheck - Determines the resource/privilege pair for the
 * current request.
 * @throws An `Error` if `req.principal` isn't set when a request
 * reaches this middleware — a misconfiguration (wrong mounting order),
 * not a client-facing condition.
 */
export function createAclAuthorizationMiddleware(
  dataSource: DataSource,
  resolveCheck: AclCheckResolver,
): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.principal) {
      throw new Error(
        'acl-authorization middleware requires the basic-auth middleware to run first (req.principal is not set)',
      );
    }

    const check = await resolveCheck(req);
    if (!check) {
      next();
      return;
    }

    const allowed = await hasPrivilege(
      dataSource.manager,
      req.principal,
      check.resource,
      check.privilege,
    );
    if (!allowed) {
      res.sendStatus(403);
      return;
    }

    next();
  };
}
