import { randomUUID } from 'node:crypto';
import {
  buildActiveLockXml,
  buildErrorResponse,
  CalendarCollection,
  CalendarLock,
  CalendarObject,
  CalendarObjectLock,
  getEffectiveCalendarLocks,
  hasCalendarPrivilege,
  parseLockInfoRequestBody,
  wouldConflict,
  type DataSource,
  type EffectiveLock,
  type EntityManager,
  type LockDepth,
  type LockScope,
  type Privilege,
} from '@davnode/core';
import express, { type Express, type Request, type Response } from 'express';
import {
  calendarOwnerIdParam,
  pathSegments,
  requirePrincipal,
  requireTenant,
} from '../dav-request.util.js';
import {
  computeLockExpiresAt,
  extractIfHeaderLockToken,
  grantLockTimeout,
  isCalendarLock,
} from '../lock.util.js';
import { resolveCalendarLockTarget } from './calendar-object-resolver.js';

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
 * Takes the exclusive database lock on the calendar row, so that creating
 * locks in one calendar happens one at a time: without it two LOCK
 * requests could each find the resource free and both grant an exclusive
 * lock. The calendar row is the same one every object write locks first
 * (see `saveCalendarObject`), so the lock order is uniform and cannot
 * deadlock. SQLite has no row locks and needs none — it runs one write
 * transaction at a time.
 */
async function lockCalendarRow(
  manager: EntityManager,
  calendarId: string,
): Promise<void> {
  if (manager.connection.options.type === 'better-sqlite3') {
    return;
  }
  await manager
    .getRepository(CalendarCollection)
    .createQueryBuilder('calendar')
    .setLock('pessimistic_write')
    .where('calendar.id = :calendarId', { calendarId })
    .getOne();
}

/**
 * Whether granting a `requestedScope` lock on `calendar` — recursively
 * down to every object it holds — would conflict with a lock already in
 * effect on any of them. The CalDAV analog of the CardDAV LOCK route's
 * `subtreeHasConflict`: calendars don't nest (Runde 21), so there is no
 * further recursion once every `CalendarObject` inside `calendar` has been
 * checked.
 */
async function subtreeHasConflict(
  manager: EntityManager,
  calendar: CalendarCollection,
  requestedScope: LockScope,
): Promise<boolean> {
  const objects = await manager
    .getRepository(CalendarObject)
    .findBy({ calendarId: calendar.id });
  for (const object of objects) {
    const objectLocks = await getEffectiveCalendarLocks(manager, object);
    if (wouldConflict(objectLocks, requestedScope)) {
      return true;
    }
  }
  return false;
}

/**
 * Builds a LOCK success response body: `<D:prop><D:lockdiscovery>` with a
 * single `<D:activelock>` for the lock just created or refreshed — see the
 * WebDAV LOCK route's own copy of this logic (`../lock.route.ts`) for the
 * RFC 4918 §9.10.1 rationale.
 */
function buildLockDiscoveryResponseBody(
  lock: EffectiveLock<CalendarLock | CalendarObjectLock>,
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
 * `expiresAt` — the CalDAV analog of the WebDAV LOCK route's own
 * `persistRefreshedTimeout`, discriminating `CalendarLock` from
 * `CalendarObjectLock` via {@link isCalendarLock}.
 */
async function persistRefreshedTimeout(
  dataSource: DataSource,
  lock: EffectiveLock<CalendarLock | CalendarObjectLock>,
  timeoutSeconds: number,
  expiresAt: Date,
): Promise<void> {
  if (isCalendarLock(lock)) {
    await dataSource
      .getRepository(CalendarLock)
      .update({ id: lock.id }, { timeoutSeconds, expiresAt });
    return;
  }
  await dataSource
    .getRepository(CalendarObjectLock)
    .update({ id: lock.id }, { timeoutSeconds, expiresAt });
}

/**
 * Registers the LOCK route for
 * `/dav/{tenantSlug}/calendars/{userId}{/*splat}` (RFC 4918 §9.10,
 * instantiated for the calendar domain per M6 Große Aufgabe 5): creates a
 * new write lock on a `CalendarCollection`/`CalendarObject`, or refreshes
 * one the requesting principal already holds.
 *
 * Structurally identical to the CardDAV LOCK route (M5,
 * `../carddav/lock.route.ts`) and the WebDAV one (M4) — see there for the
 * full RFC 4918 rationale (Locked-Null-Resources out of scope,
 * refresh-vs-creation via an empty body, `Timeout` handling, response
 * shape). `{userId}` only identifies whose calendar this is; access is
 * `hasCalendarPrivilege`, like GET/PUT/DELETE: an exclusive lock needs
 * `bind` on a calendar or `write-content` on an object, a shared one
 * `read`. `Depth: infinity` on a calendar covers its objects directly
 * (one level, no further recursion — calendars don't nest).
 *
 * The conflict check and the insert of a new lock run in one transaction
 * under the calendar row's database lock, so of several concurrent
 * requests for the same resource exactly one is granted an exclusive lock
 * (the WebDAV and CardDAV LOCK routes check first and insert later).
 *
 * A target that doesn't exist is `404` under the requester's own home and
 * `403` under anyone else's, so nothing leaks about other identities.
 */
export function registerCaldavLockRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.lock(
    '/dav/:tenantSlug/calendars/:userId{/*splat}',
    express.text({ type: () => true }),
    async (req: Request, res: Response): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = calendarOwnerIdParam(req);
      const segments = pathSegments(req);

      const target = await resolveCalendarLockTarget(
        dataSource,
        tenant.id,
        userId,
        segments,
      );
      if (!target) {
        res.sendStatus(userId === principal.id ? 404 : 403);
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

        const effectiveLocks = await getEffectiveCalendarLocks(
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

        const refreshedLock: EffectiveLock<CalendarLock | CalendarObjectLock> =
          { ...matchingLock, timeoutSeconds, expiresAt };
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
          ? target instanceof CalendarCollection
            ? 'bind'
            : 'write-content'
          : 'read';
      const allowed = await hasCalendarPrivilege(
        dataSource.manager,
        principal,
        target,
        requiredPrivilege,
      );
      if (!allowed) {
        res.sendStatus(403);
        return;
      }

      const token = `urn:uuid:${randomUUID()}`;
      const timeoutSeconds = grantLockTimeout(req.header('Timeout'));
      const expiresAt = computeLockExpiresAt(timeoutSeconds);
      // The conflict check and the insert are one unit under the calendar
      // row's lock: checking first and inserting later would let two
      // concurrent requests both be granted an exclusive lock.
      const created = await dataSource.transaction(async (manager) => {
        await lockCalendarRow(
          manager,
          target instanceof CalendarCollection ? target.id : target.calendarId,
        );
        const ownLocks = await getEffectiveCalendarLocks(manager, target);
        if (
          wouldConflict(ownLocks, lockInfo.scope) ||
          (lockDepth === 'infinity' &&
            target instanceof CalendarCollection &&
            (await subtreeHasConflict(manager, target, lockInfo.scope)))
        ) {
          return null;
        }
        if (target instanceof CalendarCollection) {
          const repository = manager.getRepository(CalendarLock);
          return repository.save(
            repository.create({
              calendarId: target.id,
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
        const repository = manager.getRepository(CalendarObjectLock);
        return repository.save(
          repository.create({
            calendarObjectId: target.id,
            principalId: principal.id,
            token,
            scope: lockInfo.scope,
            timeoutSeconds,
            expiresAt,
            ownerInfo: lockInfo.ownerInfo,
          }),
        );
      });
      if (!created) {
        sendLockError(res, 423, 'no-conflicting-lock');
        return;
      }

      const effectiveLock: EffectiveLock<CalendarLock | CalendarObjectLock> = {
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
