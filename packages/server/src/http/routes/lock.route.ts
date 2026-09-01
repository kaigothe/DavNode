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
import {
  computeLockExpiresAt,
  extractIfHeaderLockToken,
  grantLockTimeout,
  isCollectionLock,
} from './lock.util.js';

/** Sends a `423 Locked`/`412 Precondition Failed` with an RFC 4918 §16 `<D:error>` body naming `condition`. */
function sendLockError(res: Response, status: 423 | 412, condition: string): void {
  res
    .status(status)
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
 * a single `<D:activelock>` for the lock just created or refreshed (RFC
 * 4918 §9.10.1 only requires the new/refreshed lock's full information —
 * details about any other, still-compatible locks on the resource are
 * explicitly OPTIONAL, unlike PROPFIND's `lockdiscovery`, which reports
 * every effective lock — see `milestones/M4-locking-sync/06-lock-properties`).
 */
function buildLockDiscoveryResponseBody(
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
 * Persists a (possibly inherited) lock's newly granted `timeoutSeconds`/
 * `expiresAt` — used by the refresh path, where the lock being refreshed
 * may sit on an ancestor collection rather than the requested resource
 * itself (RFC 4918 §9.10.2 allows refreshing via any resource within the
 * lock's scope). `EffectiveLock` doesn't say which table a given lock
 * came from, so this discriminates the same way `buildActiveLockXml`'s
 * depth handling does: a `CollectionLock` row has `collectionId`, a
 * `FileLock` row doesn't.
 */
async function persistRefreshedTimeout(
  dataSource: DataSource,
  lock: EffectiveLock,
  timeoutSeconds: number,
  expiresAt: Date,
): Promise<void> {
  if (isCollectionLock(lock)) {
    await dataSource
      .getRepository(CollectionLock)
      .update({ id: lock.id }, { timeoutSeconds, expiresAt });
    return;
  }
  await dataSource
    .getRepository(FileLock)
    .update({ id: lock.id }, { timeoutSeconds, expiresAt });
}

/**
 * Registers the LOCK route for `/dav/{tenantSlug}/files{/*path}` (RFC
 * 4918 §9.10): creates a new write lock on an existing resource, or
 * refreshes one the requesting principal already holds.
 *
 * **Locked-Null-Resources** (RFC 4918 §9.10.4 — LOCK on an unmapped URL
 * to reserve the name) are out of scope (see
 * `milestones/M4-locking-sync/00-setting-goal.md`): the target must
 * already exist, or the request is `404`.
 *
 * **Creation vs. refresh**: an empty request body means refresh (RFC
 * 4918 §9.10.2) — the `Depth` header is ignored entirely for it (per
 * that same section), and the lock to refresh is read from the `If`
 * header (see {@link extractIfHeaderLockToken}; only the simple,
 * single-token form is supported, matching what §9.10.2 itself
 * requires clients to send). A non-empty body is always lock creation.
 * An empty body with no usable `If`-header token is `400`.
 *
 * **Refresh**: the token must name one of `target`'s currently
 * *effective* locks (`getEffectiveLocks` already excludes expired ones,
 * so "not found" covers both "unknown token" and "expired") — otherwise
 * `412 Precondition Failed` with `lock-token-matches-request-uri` (RFC
 * 4918 §9.10.6). The requesting principal must also be that lock's
 * holder, or `403`. On success, only `timeoutSeconds`/`expiresAt` change
 * — the token itself never does — and no `Lock-Token` response header is
 * sent (RFC 4918 §9.10.2 explicitly excludes it from a refresh
 * response).
 *
 * **Creation authorization** (project-specific, beyond what RFC 4918
 * itself specifies): an `exclusive` lock requires `write-content` on a
 * file or `bind` on a collection; a `shared` lock only requires `read`.
 * Checked inline rather than through `createAclAuthorizationMiddleware`,
 * since which privilege applies depends on the parsed request body
 * (`lockinfo`'s `lockscope`), not just the resource and HTTP method.
 *
 * **Creation `Depth` header**: only `0` or `infinity` are valid (`400`
 * for anything else, e.g. `1` — undefined for LOCK per RFC 4918
 * §9.10.3); a missing header defaults to `infinity`, the same default
 * RFC 4918 §9.10.3 mandates.
 *
 * **Creation conflict checking**: `getEffectiveLocks` + `wouldConflict`
 * (see `milestones/M4-locking-sync/02-lock-evaluation`) against the
 * target itself, and — for `Depth: infinity` on a `Collection` —
 * against every descendant too (see {@link subtreeHasConflict}); either
 * rejects the whole request with `423 Locked` and a `no-conflicting-lock`
 * precondition, before anything is written.
 *
 * **`Timeout` handling** (creation and refresh alike, `grantLockTimeout`
 * in `lock.util.ts`): project policy, since RFC 4918 leaves the grant
 * entirely up to the server — `Second-3600` if the client sends no
 * `Timeout` header (or nothing in it parses), and any requested
 * `Infinite`/longer value capped at `Second-86400` rather than
 * rejected. The actually granted value is echoed back in a `Timeout`
 * response header, in addition to the response body's `lockdiscovery`.
 *
 * Success is always `200 OK` — never `201 Created`, since
 * Locked-Null-Resource creation is out of scope. Creation additionally
 * sets the `Lock-Token` response header (RFC 4918 §10.5's `Coded-URL`
 * syntax, angle-bracket-wrapped).
 */
export function registerLockRoute(app: Express, dataSource: DataSource): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);

  app.lock(
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

      const rawBody = typeof req.body === 'string' ? req.body.trim() : '';
      const isRefresh = rawBody === '';

      if (isRefresh) {
        const token = extractIfHeaderLockToken(req.header('If'));
        if (token === null) {
          res.sendStatus(400);
          return;
        }

        const effectiveLocks = await getEffectiveLocks(
          dataSource.manager,
          target,
        );
        const matchingLock = effectiveLocks.find(
          (lock) => lock.token === token,
        );
        if (!matchingLock) {
          sendLockError(res, 412, 'lock-token-matches-request-uri');
          return;
        }
        if (matchingLock.principalId !== principal.id) {
          res.sendStatus(403);
          return;
        }

        const timeoutSeconds = grantLockTimeout(req.header('Timeout'));
        const expiresAt = computeLockExpiresAt(timeoutSeconds);
        await persistRefreshedTimeout(
          dataSource,
          matchingLock,
          timeoutSeconds,
          expiresAt,
        );

        const refreshedLock: EffectiveLock = {
          ...matchingLock,
          timeoutSeconds,
          expiresAt,
        };
        res
          .status(200)
          .set('Timeout', `Second-${timeoutSeconds}`)
          .set('Content-Type', 'application/xml; charset=utf-8')
          .send(buildLockDiscoveryResponseBody(refreshedLock, req.path));
        return;
      }

      const depthHeader = req.header('Depth') ?? 'infinity';
      if (depthHeader !== '0' && depthHeader !== 'infinity') {
        res.sendStatus(400);
        return;
      }
      const lockDepth: LockDepth = depthHeader === '0' ? 'zero' : 'infinity';

      let lockInfo;
      try {
        lockInfo = parseLockInfoRequestBody(rawBody);
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
        sendLockError(res, 423, 'no-conflicting-lock');
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
        sendLockError(res, 423, 'no-conflicting-lock');
        return;
      }

      const token = `urn:uuid:${randomUUID()}`;
      const timeoutSeconds = grantLockTimeout(req.header('Timeout'));
      const expiresAt = computeLockExpiresAt(timeoutSeconds);
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
              timeoutSeconds,
              expiresAt,
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
            timeoutSeconds,
            expiresAt,
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
        .set('Timeout', `Second-${timeoutSeconds}`)
        .set('Content-Type', 'application/xml; charset=utf-8')
        .send(buildLockDiscoveryResponseBody(effectiveLock, req.path));
    },
  );
}
