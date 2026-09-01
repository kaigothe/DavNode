import { randomUUID } from 'node:crypto';
import {
  buildActiveLockXml,
  buildErrorResponse,
  Collection,
  CollectionLock,
  FileLock,
  getEffectiveLocks,
  hasPrivilege,
  parseLockInfoRequestBody,
  ResourcePathResolver,
  wouldConflict,
  type DataSource,
  type EffectiveLock,
  type LockDepth,
  type LockScope,
  type Privilege,
} from '@davnode/core';
import express, { type Express, type Request, type Response } from 'express';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from './dav-request.util.js';

/** Sends a `423 Locked` with an RFC 4918 §16 `<D:error>` body naming `condition`. */
function sendLockError(res: Response, condition: string): void {
  res
    .status(423)
    .set('Content-Type', 'application/xml; charset=utf-8')
    .send(buildErrorResponse([condition]));
}

/**
 * Whether granting a `requestedScope` lock, recursively down `collection`'s
 * entire subtree, would conflict with any lock already in effect
 * anywhere in it. Per this project's simplification of RFC 4918
 * §9.10.3's partial-failure handling (see
 * `milestones/M4-locking-sync/00-setting-goal.md`), a single conflict
 * anywhere rejects the whole `Depth: infinity` request — so this stops
 * at the first conflict found rather than collecting every one.
 */
async function subtreeHasConflict(
  resourcePathResolver: ResourcePathResolver,
  dataSource: DataSource,
  collection: Collection,
  requestedScope: LockScope,
): Promise<boolean> {
  const children = await resourcePathResolver.listChildren(collection);
  for (const child of children) {
    const childLocks = await getEffectiveLocks(dataSource.manager, child);
    if (wouldConflict(childLocks, requestedScope)) {
      return true;
    }
    if (
      child instanceof Collection &&
      (await subtreeHasConflict(
        resourcePathResolver,
        dataSource,
        child,
        requestedScope,
      ))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Builds a LOCK success response body: `<D:prop><D:lockdiscovery>` with
 * a single `<D:activelock>` for the lock just created (RFC 4918 §9.10.1
 * only requires the new lock's full information — details about any
 * other, still-compatible locks on the resource are explicitly
 * OPTIONAL, unlike PROPFIND's `lockdiscovery`, which reports every
 * effective lock — see `milestones/M4-locking-sync/06-lock-properties`).
 */
function buildLockCreationResponseBody(
  lock: EffectiveLock,
  lockRootHref: string,
): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<D:prop xmlns:D="DAV:"><D:lockdiscovery>' +
    buildActiveLockXml(lock, lockRootHref) +
    '</D:lockdiscovery></D:prop>'
  );
}

/**
 * Registers the LOCK route for `/dav/{tenantSlug}/files{/*path}` (RFC
 * 4918 §9.10): creates a new write lock on an existing resource.
 *
 * Lock refresh (a LOCK request with no body, `If` header only) is not
 * yet handled here — see
 * `milestones/M4-locking-sync/03-lock-method/02-lock-refresh-and-timeout.md`,
 * the very next sub-task. A body that fails to parse as `<D:lockinfo>`,
 * including an empty one, is `400 Bad Request` for now.
 *
 * **Locked-Null-Resources** (RFC 4918 §9.10.4 — LOCK on an unmapped URL
 * to reserve the name) are out of scope (see
 * `milestones/M4-locking-sync/00-setting-goal.md`): the target must
 * already exist, or the request is `404`.
 *
 * **Authorization** (project-specific, beyond what RFC 4918 itself
 * specifies): an `exclusive` lock requires `write-content` on a file or
 * `bind` on a collection; a `shared` lock only requires `read`. Checked
 * inline rather than through `createAclAuthorizationMiddleware`, since
 * which privilege applies depends on the parsed request body
 * (`lockinfo`'s `lockscope`), not just the resource and HTTP method.
 *
 * **`Depth` header**: only `0` or `infinity` are valid (`400` for
 * anything else, e.g. `1` — undefined for LOCK per RFC 4918 §9.10.3); a
 * missing header defaults to `infinity`, the same default RFC 4918
 * §9.10.3 mandates.
 *
 * **Conflict checking**: `getEffectiveLocks` + `wouldConflict` (see
 * `milestones/M4-locking-sync/02-lock-evaluation`) against the target
 * itself, and — for `Depth: infinity` on a `Collection` — against every
 * descendant too (see {@link subtreeHasConflict}); either rejects the
 * whole request with `423 Locked` and a `no-conflicting-lock`
 * precondition, before anything is written.
 *
 * Every newly created lock is `Infinite` (`timeoutSeconds`/`expiresAt`
 * both `null`) for now — the `Timeout` request header isn't parsed yet;
 * that's the very next sub-task too.
 *
 * Success is always `200 OK` with a `Lock-Token` response header
 * (RFC 4918 §10.5's `Coded-URL` syntax, angle-bracket-wrapped) and a
 * `lockdiscovery` body — never `201 Created`, since Locked-Null-Resource
 * creation is out of scope.
 */
export function registerLockRoute(app: Express, dataSource: DataSource): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);

  app.lock(
    '/dav/:tenantSlug/files{/*splat}',
    express.text({ type: () => true }),
    async (req: Request, res: Response): Promise<void> => {
      const depthHeader = req.header('Depth') ?? 'infinity';
      if (depthHeader !== '0' && depthHeader !== 'infinity') {
        res.sendStatus(400);
        return;
      }
      const lockDepth: LockDepth = depthHeader === '0' ? 'zero' : 'infinity';

      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const segments = pathSegments(req);

      const target = await resourcePathResolver.resolve(tenant.id, segments);
      if (!target) {
        res.sendStatus(404);
        return;
      }

      let lockInfo;
      try {
        lockInfo = parseLockInfoRequestBody(
          typeof req.body === 'string' ? req.body : '',
        );
      } catch {
        res.sendStatus(400);
        return;
      }

      const requiredPrivilege: Privilege =
        lockInfo.scope === 'exclusive'
          ? target instanceof Collection
            ? 'bind'
            : 'write-content'
          : 'read';
      const allowed = await hasPrivilege(
        dataSource.manager,
        principal,
        target,
        requiredPrivilege,
      );
      if (!allowed) {
        res.sendStatus(403);
        return;
      }

      const ownLocks = await getEffectiveLocks(dataSource.manager, target);
      if (wouldConflict(ownLocks, lockInfo.scope)) {
        sendLockError(res, 'no-conflicting-lock');
        return;
      }
      if (
        lockDepth === 'infinity' &&
        target instanceof Collection &&
        (await subtreeHasConflict(
          resourcePathResolver,
          dataSource,
          target,
          lockInfo.scope,
        ))
      ) {
        sendLockError(res, 'no-conflicting-lock');
        return;
      }

      const token = `urn:uuid:${randomUUID()}`;
      const created = await dataSource.transaction(async (manager) => {
        if (target instanceof Collection) {
          const repository = manager.getRepository(CollectionLock);
          return repository.save(
            repository.create({
              collectionId: target.id,
              principalId: principal.id,
              token,
              scope: lockInfo.scope,
              depth: lockDepth,
              timeoutSeconds: null,
              expiresAt: null,
              ownerInfo: lockInfo.ownerInfo,
            }),
          );
        }
        const repository = manager.getRepository(FileLock);
        return repository.save(
          repository.create({
            fileResourceId: target.id,
            principalId: principal.id,
            token,
            scope: lockInfo.scope,
            timeoutSeconds: null,
            expiresAt: null,
            ownerInfo: lockInfo.ownerInfo,
          }),
        );
      });

      const effectiveLock: EffectiveLock = {
        ...created,
        inherited: false,
        inheritedFrom: null,
      };

      res
        .status(200)
        .set('Lock-Token', `<${token}>`)
        .set('Content-Type', 'application/xml; charset=utf-8')
        .send(buildLockCreationResponseBody(effectiveLock, req.path));
    },
  );
}
