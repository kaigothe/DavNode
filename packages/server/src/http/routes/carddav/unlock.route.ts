import {
  AddressbookLock,
  AddressObjectLock,
  buildErrorResponse,
  getEffectiveAddressbookLocks,
  hasAddressbookPrivilege,
  type DataSource,
} from '@davnode/core';
import express, { type Express, type Request, type Response } from 'express';
import {
  addressbookOwnerIdParam,
  pathSegments,
  requirePrincipal,
  requireTenant,
} from '../dav-request.util.js';
import { isAddressbookLock, parseLockTokenHeader } from '../lock.util.js';
import { resolveLockTarget } from './address-object-resolver.js';

/** Sends a `409 Conflict` with an RFC 4918 §16 `<D:error>` body naming `condition`. */
function sendUnlockError(res: Response, condition: string): void {
  res
    .status(409)
    .set('Content-Type', 'application/xml; charset=utf-8')
    .send(buildErrorResponse([condition]));
}

/**
 * Registers the UNLOCK route for
 * `/dav/{tenantSlug}/addressbooks/{userId}{/*splat}` (RFC 4918 §9.11,
 * instantiated for the addressbook domain per M5 Große Aufgabe 5):
 * removes the lock named by the `Lock-Token` request header.
 *
 * Structurally identical to the WebDAV UNLOCK route (M4,
 * `../unlock.route.ts`) — see there for the full RFC 4918 §9.11
 * rationale (status codes, the `unlock`-privilege fallback for a
 * non-holder). The only differences are the ones the rest of the
 * CardDAV routes already have: the target is resolved by name via
 * `resolveLockTarget` (either an `AddressbookCollection` or an
 * `AddressObject`) instead of `ResourcePathResolver`, and effective
 * locks come from `getEffectiveAddressbookLocks` instead of
 * `getEffectiveWebDavLocks`.
 */
export function registerCarddavUnlockRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.unlock(
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

      const token = parseLockTokenHeader(req.header('Lock-Token'));
      if (token === null) {
        res.sendStatus(400);
        return;
      }

      const effectiveLocks = await getEffectiveAddressbookLocks(
        dataSource.manager,
        target,
      );
      const matchingLock = effectiveLocks.find((lock) => lock.token === token);
      if (!matchingLock) {
        sendUnlockError(res, 'lock-token-matches-request-uri');
        return;
      }

      if (matchingLock.principalId !== principal.id) {
        const allowed = await hasAddressbookPrivilege(
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

      if (isAddressbookLock(matchingLock)) {
        await dataSource
          .getRepository(AddressbookLock)
          .delete({ id: matchingLock.id });
      } else {
        await dataSource
          .getRepository(AddressObjectLock)
          .delete({ id: matchingLock.id });
      }

      res.sendStatus(204);
    },
  );
}
