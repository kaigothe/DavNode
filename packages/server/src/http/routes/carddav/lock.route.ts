import { randomUUID } from 'node:crypto';
import {
  AddressbookCollection,
  AddressbookLock,
  AddressObjectLock,
  buildActiveLockXml,
  buildErrorResponse,
  getEffectiveAddressbookLocks,
  hasAddressbookPrivilege,
  parseLockInfoRequestBody,
  wouldConflict,
  type DataSource,
  type EffectiveLock,
  type LockDepth,
  type LockScope,
  type Privilege,
} from '@davnode/core';
import express, { type Express, type Request, type Response } from 'express';
import {
  addressbookOwnerIdParam,
  pathSegments,
  requirePrincipal,
  requireTenant,
} from '../dav-request.util.js';
import {
  computeLockExpiresAt,
  extractIfHeaderLockToken,
  grantLockTimeout,
  isAddressbookLock,
} from '../lock.util.js';
import {
  listAddressObjects,
  resolveLockTarget,
} from './address-object-resolver.js';

/** Sends a `423 Locked`/`412 Precondition Failed` with an RFC 4918 §16 `<D:error>` body naming `condition`. */
function sendLockError(
  res: Response,
  status: 423 | 412,
  condition: string,
): void {
  res
    .status(status)
    .set('Content-Type', 'application/xml; charset=utf-8')
    .send(buildErrorResponse([condition]));
}

/**
 * Whether granting a `requestedScope` lock on `addressbook` — recursively
 * down to every contact it holds — would conflict with a lock already
 * in effect on any of them. The CardDAV analog of the WebDAV LOCK
 * route's `subtreeHasConflict`, simplified by Runde 20's one-level
 * structure: addressbooks don't nest, so there is no further recursion
 * once every `AddressObject` inside `addressbook` has been checked.
 */
async function subtreeHasConflict(
  dataSource: DataSource,
  addressbook: AddressbookCollection,
  requestedScope: LockScope,
): Promise<boolean> {
  const contacts = await listAddressObjects(dataSource, addressbook.id);
  for (const contact of contacts) {
    const contactLocks = await getEffectiveAddressbookLocks(
      dataSource.manager,
      contact,
    );
    if (wouldConflict(contactLocks, requestedScope)) {
      return true;
    }
  }
  return false;
}

/**
 * Builds a LOCK success response body: `<D:prop><D:lockdiscovery>` with
 * a single `<D:activelock>` for the lock just created or refreshed —
 * see the WebDAV LOCK route's own copy of this logic (`../lock.route.ts`)
 * for the RFC 4918 §9.10.1 rationale.
 */
function buildLockDiscoveryResponseBody(
  lock: EffectiveLock<AddressbookLock | AddressObjectLock>,
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
 * `expiresAt` — the CardDAV analog of the WebDAV LOCK route's own
 * `persistRefreshedTimeout`, discriminating `AddressbookLock` from
 * `AddressObjectLock` via {@link isAddressbookLock}.
 */
async function persistRefreshedTimeout(
  dataSource: DataSource,
  lock: EffectiveLock<AddressbookLock | AddressObjectLock>,
  timeoutSeconds: number,
  expiresAt: Date,
): Promise<void> {
  if (isAddressbookLock(lock)) {
    await dataSource
      .getRepository(AddressbookLock)
      .update({ id: lock.id }, { timeoutSeconds, expiresAt });
    return;
  }
  await dataSource
    .getRepository(AddressObjectLock)
    .update({ id: lock.id }, { timeoutSeconds, expiresAt });
}

/**
 * Registers the LOCK route for
 * `/dav/{tenantSlug}/addressbooks/{userId}{/*splat}` (RFC 4918 §9.10,
 * instantiated for the addressbook domain per M5 Große Aufgabe 5):
 * creates a new write lock on an `AddressbookCollection`/`AddressObject`,
 * or refreshes one the requesting principal already holds.
 *
 * Structurally identical to the WebDAV LOCK route (M4, `../lock.route.ts`)
 * — see there for the full RFC 4918 rationale (Locked-Null-Resources out
 * of scope, refresh-vs-creation via an empty body, `Timeout` handling,
 * response shape). The differences are exactly the ones the rest of the
 * CardDAV routes already have: `{userId}` only identifies whose
 * addressbook this is (not an ACL shortcut — access is
 * `hasAddressbookPrivilege`, same as GET/PUT/DELETE), the target is
 * resolved by name via {@link resolveLockTarget} instead of
 * `ResourcePathResolver`, and `Depth: infinity` on an addressbook covers
 * its contacts directly (one level, no further recursion — addressbooks
 * don't nest, Runde 20) rather than an arbitrary collection subtree.
 */
export function registerCarddavLockRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.lock(
    '/dav/:tenantSlug/addressbooks/:userId{/*splat}',
    express.text({ type: () => true }),
    async (req: Request, res: Response): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = addressbookOwnerIdParam(req);
      const segments = pathSegments(req);

      const target = await resolveLockTarget(
        dataSource,
        tenant.id,
        userId,
        segments,
      );
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

        const effectiveLocks = await getEffectiveAddressbookLocks(
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

        const refreshedLock: EffectiveLock<
          AddressbookLock | AddressObjectLock
        > = {
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
          ? target instanceof AddressbookCollection
            ? 'bind'
            : 'write-content'
          : 'read';
      const allowed = await hasAddressbookPrivilege(
        dataSource.manager,
        principal,
        target,
        requiredPrivilege,
      );
      if (!allowed) {
        res.sendStatus(403);
        return;
      }

      const ownLocks = await getEffectiveAddressbookLocks(
        dataSource.manager,
        target,
      );
      if (wouldConflict(ownLocks, lockInfo.scope)) {
        sendLockError(res, 423, 'no-conflicting-lock');
        return;
      }
      if (
        lockDepth === 'infinity' &&
        target instanceof AddressbookCollection &&
        (await subtreeHasConflict(dataSource, target, lockInfo.scope))
      ) {
        sendLockError(res, 423, 'no-conflicting-lock');
        return;
      }

      const token = `urn:uuid:${randomUUID()}`;
      const timeoutSeconds = grantLockTimeout(req.header('Timeout'));
      const expiresAt = computeLockExpiresAt(timeoutSeconds);
      const created = await dataSource.transaction(async (manager) => {
        if (target instanceof AddressbookCollection) {
          const repository = manager.getRepository(AddressbookLock);
          return repository.save(
            repository.create({
              addressbookId: target.id,
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
        const repository = manager.getRepository(AddressObjectLock);
        return repository.save(
          repository.create({
            addressObjectId: target.id,
            principalId: principal.id,
            token,
            scope: lockInfo.scope,
            timeoutSeconds,
            expiresAt,
            ownerInfo: lockInfo.ownerInfo,
          }),
        );
      });

      const effectiveLock: EffectiveLock<AddressbookLock | AddressObjectLock> =
        {
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
