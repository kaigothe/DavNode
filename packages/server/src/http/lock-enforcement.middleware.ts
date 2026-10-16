import {
  buildErrorResponse,
  evaluateIfHeader,
  hasValidLockToken,
  parseIfHeader,
  type DataSource,
  type EffectiveLock,
  type EntityManager,
  type LockLike,
} from '@davnode/core';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Extracts every lock token asserted as a *positive* condition in an
 * `If` header (RFC 4918 §10.4) — deliberately scoped to just the
 * lock-token subset of that header's grammar: one or more parenthesized
 * groups, each either `(<urn:uuid:...>)` (asserts the client holds this
 * token) or `(Not <urn:uuid:...>)` (asserted but not a token the client
 * is submitting for coverage, so ignored here). The `If` header's other
 * capability — combining conditions with entity-tags inside the same
 * group — is **not** supported; ETag conditionals already have their
 * own, separate mechanism (`If-Match`/`If-None-Match`, see M2), and nothing
 * in this project mixes the two within one `If` header. A group this
 * parser can't make sense of (an ETag condition, malformed syntax) is
 * silently skipped rather than rejected — the same "best effort,
 * findable content only" posture `extractIfHeaderLockToken` (LOCK
 * refresh, `lock.util.ts`) already takes.
 */
function parseIfHeaderLockTokens(headerValue: string | undefined): Set<string> {
  const tokens = new Set<string>();
  if (headerValue === undefined) {
    return tokens;
  }
  for (const groupMatch of headerValue.matchAll(/\(([^()]*)\)/g)) {
    const groupContent = groupMatch[1]?.trim() ?? '';
    if (groupContent.startsWith('Not')) {
      continue;
    }
    const tokenMatch = /<([^>]+)>/.exec(groupContent);
    if (tokenMatch) {
      tokens.add(tokenMatch[1]);
    }
  }
  return tokens;
}

/**
 * Fetches every lock currently effective on `resource` — the shape both
 * `getEffectiveWebDavLocks` and `getEffectiveAddressbookLocks` already
 * have, passed in explicitly rather than imported here so this
 * middleware carries no compile-time dependency on any specific
 * domain's lock evaluation, the same reason
 * `createAclAuthorizationMiddleware` takes its `checkPrivilege`
 * parameter the same way.
 */
export type GetEffectiveLocks<TResource> = (
  manager: EntityManager,
  resource: TResource,
) => Promise<EffectiveLock<LockLike>[]>;

/**
 * Whether a request carrying `ifHeader` is entitled to mutate every one
 * of `resources` despite whatever locks (RFC 4918 §6, direct or
 * inherited) are currently in effect on each — every resource's
 * complete effective-lock set must be covered by a submitted token (see
 * `hasValidLockToken`, `milestones/M4-locking-sync/02-lock-evaluation`).
 * Shared by {@link createLockEnforcementMiddleware} and the COPY/MOVE
 * routes, which check locks inline rather than through that middleware
 * (see there for why — the same reason they don't use
 * `createAclAuthorizationMiddleware` either).
 *
 * @param getEffectiveLocksFn - The domain's own effective-locks lookup
 * (`getEffectiveWebDavLocks` for the WebDAV file tree,
 * `getEffectiveAddressbookLocks` for the addressbook domain).
 */
export async function checkLockEnforcement<TResource>(
  dataSource: DataSource,
  ifHeader: string | undefined,
  resources: readonly TResource[],
  getEffectiveLocksFn: GetEffectiveLocks<TResource>,
): Promise<boolean> {
  const submittedTokens = parseIfHeaderLockTokens(ifHeader);
  for (const resource of resources) {
    const effectiveLocks = await getEffectiveLocksFn(
      dataSource.manager,
      resource,
    );
    if (!hasValidLockToken(effectiveLocks, submittedTokens)) {
      return false;
    }
  }
  return true;
}

/** Sends a `423 Locked` with an RFC 4918 §16 `<D:lock-token-submitted/>` body. */
export function sendLockEnforcementError(res: Response): void {
  res
    .status(423)
    .set('Content-Type', 'application/xml; charset=utf-8')
    .send(buildErrorResponse(['lock-token-submitted']));
}

/**
 * What {@link createLockEnforcementMiddleware} needs to run one
 * request's lock check: every resource RFC 4918 §7.4 requires a
 * covering lock token for, given this request's method and outcome.
 */
export interface LockEnforcementCheck<TResource> {
  resources: TResource[];
  /**
   * The resource the request itself addresses, for evaluating the `If`
   * header's conditions (RFC 4918 §10.4): `null` when it does not exist
   * (so no entity tag matches and it has no locks), omitted when the
   * route does not want `If` conditions evaluated at all. Distinct from
   * {@link resources}, which also holds parents whose locks must be
   * covered.
   */
  subject?: TResource | null;
}

/**
 * Resolves the {@link LockEnforcementCheck} a request needs, or `null`
 * if there's nothing to check yet — mirrors `AclCheckResolver`'s "return
 * `null` to skip" contract exactly (e.g. a missing parent collection,
 * which the route handler is better positioned to turn into the right
 * `404`/`409`).
 */
export type LockEnforcementCheckResolver<TResource> = (
  req: Request,
) => Promise<LockEnforcementCheck<TResource> | null>;

/**
 * Creates the lock-enforcement middleware (RFC 4918 §7.4/§10.4): a
 * mutating method on a locked resource is rejected with `423 Locked`
 * unless the request's `If` header submits a token covering every
 * relevant lock.
 *
 * Which resource(s) are relevant varies by method — and, like ACL
 * authorization, sometimes by outcome within one method (PUT checks the
 * target when overwriting, the parent collection when creating) — so
 * each route supplies its own {@link LockEnforcementCheckResolver}
 * rather than this middleware guessing from the request alone, the same
 * division of responsibility `createAclAuthorizationMiddleware`
 * established. COPY and MOVE don't use this middleware at all, for the
 * same reason they don't use that one either: they already resolve
 * their (more than one) relevant resources inline, mid-handler, as each
 * authorization step passes — see `copy.route.ts`/`move.route.ts`,
 * which call {@link checkLockEnforcement} directly instead.
 *
 * Must run **after** ACL authorization on any route that uses both — a
 * request without the necessary privilege is `403`, not `423`, RFC 4918
 * §7 rights taking priority over a lock conflict — which per-route
 * wiring order alone (this middleware as a later argument in the same
 * `app.<method>(...)` call) already guarantees, no coordination with
 * this module needed.
 *
 * @param dataSource - Used to run the lock check (a plain read, not
 * wrapped in a transaction — nothing here writes).
 * @param resolveCheck - Determines the resource(s) the current request
 * needs checked.
 * @param getEffectiveLocksFn - The domain's own effective-locks lookup
 * (`getEffectiveWebDavLocks` for the WebDAV file tree,
 * `getEffectiveAddressbookLocks` for the addressbook domain).
 */
export function createLockEnforcementMiddleware<TResource>(
  dataSource: DataSource,
  resolveCheck: LockEnforcementCheckResolver<TResource>,
  getEffectiveLocksFn: GetEffectiveLocks<TResource>,
): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const check = await resolveCheck(req);
    if (!check) {
      next();
      return;
    }

    const allowed = await checkLockEnforcement(
      dataSource,
      req.header('If'),
      check.resources,
      getEffectiveLocksFn,
    );
    if (!allowed) {
      sendLockEnforcementError(res);
      return;
    }

    // Lock tokens are covered; now the rest of the `If` header (entity
    // tags, Not, tokens that are not actually held) must hold too, else
    // 412 Precondition Failed (RFC 4918 §10.4.1).
    const ifLists = parseIfHeader(req.header('If'));
    if (ifLists && check.subject !== undefined) {
      const subject = check.subject;
      const etag = (subject as { etag?: unknown } | null)?.etag;
      // A token counts as held if it covers the subject *or* any other
      // resource this request has to cover (the parent whose membership
      // changes): a client creating a member of a locked collection
      // submits the collection's token in an untagged list, and the
      // not-yet-existing subject has no locks of its own.
      const lockTokens = new Set<string>();
      for (const resource of check.resources) {
        for (const lock of await getEffectiveLocksFn(
          dataSource.manager,
          resource,
        )) {
          lockTokens.add(lock.token);
        }
      }
      const holds = evaluateIfHeader(ifLists, decodeRequestPath(req), {
        etag: typeof etag === 'string' ? etag : null,
        lockTokens,
      });
      if (!holds) {
        res.sendStatus(412);
        return;
      }
    }

    next();
  };
}

/** The request path without query string, percent-decoded where possible. */
function decodeRequestPath(req: Request): string {
  try {
    return decodeURIComponent(req.path);
  } catch {
    return req.path;
  }
}
