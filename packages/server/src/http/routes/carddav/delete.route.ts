import {
  AddressbookChangeService,
  AddressObject,
  AddressObjectAce,
  AddressObjectProperty,
  type DataSource,
} from '@davnode/core';
import type { Express, Request } from 'express';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from '../dav-request.util.js';
import {
  resolveAddressbook,
  resolveAddressObject,
} from './address-object-resolver.js';

/**
 * Registers the DELETE route for a single CardDAV contact:
 * `/dav/{tenantSlug}/addressbooks/{userId}/{addressbookName}/{objectName}`.
 *
 * Deletes, in one transaction: `AddressObjectProperty` and
 * `AddressObjectAce` rows explicitly (neither cascades at the DB level
 * — same reasoning as `ResourceTreeService`'s WebDAV-side cleanup, M2),
 * then the `AddressObject` row itself, which cascades its
 * `AddressObjectContent` and `AddressObjectIndex` rows automatically
 * (both declared `ON DELETE CASCADE` — Große Aufgabe 1/2). Records an
 * `AddressbookChange` (`deleted`) and bumps the addressbook's `syncSeq`
 * in the same transaction.
 *
 * **Access is the same simple, non-ACL-based rule as the other
 * addressbook routes**: `{userId}` must be the requesting principal's
 * own id, or this returns `403`.
 */
export function registerCarddavDeleteRoute(
  app: Express,
  dataSource: DataSource,
): void {
  const addressbookChanges = new AddressbookChangeService();

  app.delete(
    '/dav/:tenantSlug/addressbooks/:userId{/*splat}',
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = req.params.userId;
      if (userId !== principal.id) {
        res.sendStatus(403);
        return;
      }

      const segments = pathSegments(req);
      if (segments.length !== 2) {
        res.sendStatus(404);
        return;
      }
      const [addressbookName, objectName] = segments;

      const addressbook = await resolveAddressbook(
        dataSource,
        tenant.id,
        userId,
        addressbookName,
      );
      if (!addressbook) {
        res.sendStatus(404);
        return;
      }

      const target = await resolveAddressObject(
        dataSource,
        addressbook.id,
        objectName,
      );
      if (!target) {
        res.sendStatus(404);
        return;
      }

      await dataSource.transaction(async (manager) => {
        await manager
          .getRepository(AddressObjectProperty)
          .delete({ addressObjectId: target.id });
        await manager
          .getRepository(AddressObjectAce)
          .delete({ addressObjectId: target.id });
        await manager.getRepository(AddressObject).delete({ id: target.id });

        await addressbookChanges.recordChange(
          manager,
          addressbook.id,
          objectName,
          'deleted',
        );
      });

      res.sendStatus(204);
    },
  );
}
