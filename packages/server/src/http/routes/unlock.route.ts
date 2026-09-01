import {
  buildErrorResponse,
  CollectionLock,
  FileLock,
  getEffectiveLocks,
  hasPrivilege,
  ResourcePathResolver,
  type DataSource,
} from '@davnode/core';
import express, { type Express, type Request, type Response } from 'express';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from './dav-request.util.js';
import { isCollectionLock, parseLockTokenHeader } from './lock.util.js';

/** Sends a `409 Conflict` with an RFC 4918 §16 `<D:error>` body naming `condition`. */
function sendUnlockError(res: Response, condition: string): void {
  res
    .status(409)
    .set('Content-Type', 'application/xml; charset=utf-8')
    .send(buildErrorResponse([condition]));
}

/**
 * Registers the UNLOCK route for `/dav/{tenantSlug}/files{/*path}` (RFC
 * 4918 §9.11): removes the lock named by the `Lock-Token` request
 * header — a dedicated header unique to UNLOCK; every other
 * lock-submitting method (including LOCK refresh) uses `If` instead
 * (RFC 4918 §9.11).
 *
 * The target resource only needs to be *within the scope* of the named
 * lock, not directly locked by it: `getEffectiveLocks` (see
 * `milestones/M4-locking-sync/02-lock-evaluation`) already resolves a
 * lock inherited from an ancestor collection (`Depth: infinity`) the
 * same way LOCK refresh does, so UNLOCKing a file under such a
 * collection correctly finds and removes the collection's own lock row.
 *
 * **Status codes** (RFC 4918 §9.11.1):
 * - `400` — no `Lock-Token` header, or not a well-formed `Coded-URL`.
 * - `404` — the target resource doesn't exist at all (Locked-Null-Resources
 *   are out of scope, same as LOCK — see
 *   `milestones/M4-locking-sync/00-setting-goal.md`).
 * - `409`, `lock-token-matches-request-uri` — the token doesn't name any
 *   of the target's currently effective locks (`getEffectiveLocks`
 *   already excludes expired ones, so this also covers an
 *   already-expired token).
 * - `403` — the requesting principal is neither the lock's own holder
 *   nor privileged via `DAV:unlock` (RFC 3744 §3.5: *"the principal
 *   that created a lock can always perform an UNLOCK"*; anyone else
 *   needs the `unlock` privilege on the resource — the ACL catalog's
 *   only use of that privilege).
 * - `204` — success, no response body (RFC 4918 §9.11.1 explicitly
 *   prefers this over `200 OK` for exactly that reason).
 */
export function registerUnlockRoute(
  app: Express,
  dataSource: DataSource,
): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);

  app.unlock(
    '/dav/:tenantSlug/files{/*splat}',
    express.text({ type: () => true }),
    async (req: Request, res: Response): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const segments = pathSegments(req);

      const target = await resourcePathResolver.resolve(tenant.id, segments);
      if (!target) {
        res.sendStatus(404);
        return;
      }

      const token = parseLockTokenHeader(req.header('Lock-Token'));
      if (token === null) {
        res.sendStatus(400);
        return;
      }

      const effectiveLocks = await getEffectiveLocks(
        dataSource.manager,
        target,
      );
      const matchingLock = effectiveLocks.find((lock) => lock.token === token);
      if (!matchingLock) {
        sendUnlockError(res, 'lock-token-matches-request-uri');
        return;
      }

      if (matchingLock.principalId !== principal.id) {
        const allowed = await hasPrivilege(
          dataSource.manager,
          principal,
          target,
          'unlock',
        );
        if (!allowed) {
          res.sendStatus(403);
          return;
        }
      }

      if (isCollectionLock(matchingLock)) {
        await dataSource
          .getRepository(CollectionLock)
          .delete({ id: matchingLock.id });
      } else {
        await dataSource.getRepository(FileLock).delete({ id: matchingLock.id });
      }

      res.sendStatus(204);
    },
  );
}
