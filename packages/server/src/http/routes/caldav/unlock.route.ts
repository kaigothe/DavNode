import {
  buildErrorResponse,
  CalendarLock,
  CalendarObjectLock,
  getEffectiveCalendarLocks,
  hasCalendarPrivilege,
  type DataSource,
} from '@davnode/core';
import express, { type Express, type Request, type Response } from 'express';
import {
  calendarOwnerIdParam,
  pathSegments,
  requirePrincipal,
  requireTenant,
} from '../dav-request.util.js';
import { isCalendarLock, parseLockTokenHeader } from '../lock.util.js';
import { resolveCalendarLockTarget } from './calendar-object-resolver.js';

/** Sends a `409 Conflict` with an RFC 4918 §16 `<D:error>` body naming `condition`. */
function sendUnlockError(res: Response, condition: string): void {
  res
    .status(409)
    .set('Content-Type', 'application/xml; charset=utf-8')
    .send(buildErrorResponse([condition]));
}

/**
 * Registers the UNLOCK route for
 * `/dav/{tenantSlug}/calendars/{userId}{/*splat}` (RFC 4918 §9.11,
 * instantiated for the calendar domain per M6 Große Aufgabe 5): removes
 * the lock named by the `Lock-Token` request header.
 *
 * Structurally identical to the CardDAV UNLOCK route (M5) and the WebDAV
 * one (M4) — see there for the full RFC 4918 §9.11 rationale (status
 * codes, the `unlock`-privilege fallback for a non-holder). The target is
 * a `CalendarCollection` or a `CalendarObject` resolved by name, effective
 * locks come from `getEffectiveCalendarLocks`, and a target that doesn't
 * exist is `404` under the requester's own home and `403` under anyone
 * else's.
 */
export function registerCaldavUnlockRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.unlock(
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

      const token = parseLockTokenHeader(req.header('Lock-Token'));
      if (token === null) {
        res.sendStatus(400);
        return;
      }

      const effectiveLocks = await getEffectiveCalendarLocks(
        dataSource.manager,
        target,
      );
      const matchingLock = effectiveLocks.find((lock) => lock.token === token);
      if (!matchingLock) {
        sendUnlockError(res, 'lock-token-matches-request-uri');
        return;
      }

      if (matchingLock.principalId !== principal.id) {
        const allowed = await hasCalendarPrivilege(
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

      if (isCalendarLock(matchingLock)) {
        await dataSource
          .getRepository(CalendarLock)
          .delete({ id: matchingLock.id });
      } else {
        await dataSource
          .getRepository(CalendarObjectLock)
          .delete({ id: matchingLock.id });
      }

      res.sendStatus(204);
    },
  );
}
