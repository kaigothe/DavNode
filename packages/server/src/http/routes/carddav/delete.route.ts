import {
  AddressbookChangeService,
  AddressObject,
  AddressObjectAce,
  AddressObjectProperty,
  hasAddressbookPrivilege,
  type AddressbookAclResource,
  type DataSource,
} from '@davnode/core';
import type { Express, Request } from 'express';
import { createAclAuthorizationMiddleware } from '../../acl-authorization.middleware.js';
import {
  addressbookOwnerIdParam,
  pathSegments,
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
 * **Real RFC 3744 ACL, not an owner-only placeholder** (M5 Große
 * Aufgabe 5): deletion needs `unbind` on the addressbook — the parent
 * of the contact being removed, mirroring the WebDAV DELETE route's own
 * "unbind on the parent, not the target" rule. `{userId}` in the URL
 * only identifies whose addressbook this is, not who's allowed to
 * delete from it.
 */
export function registerCarddavDeleteRoute(
  app: Express,
  dataSource: DataSource,
): void {
  const addressbookChanges = new AddressbookChangeService();

  app.delete(
    '/dav/:tenantSlug/addressbooks/:userId{/*splat}',
    createAclAuthorizationMiddleware<AddressbookAclResource>(
      dataSource,
      async (req) => {
        const tenant = requireTenant(req);
        const userId = addressbookOwnerIdParam(req);
        const segments = pathSegments(req);
        if (segments.length !== 2) {
          return null;
        }
        const [addressbookName, objectName] = segments;
        const addressbook = await resolveAddressbook(
          dataSource,
          tenant.id,
          userId,
          addressbookName,
        );
        if (!addressbook) {
          return null;
        }
        const target = await resolveAddressObject(
          dataSource,
          addressbook.id,
          objectName,
        );
        return target ? { resource: addressbook, privilege: 'unbind' } : null;
      },
      hasAddressbookPrivilege,
    ),
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const userId = addressbookOwnerIdParam(req);

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
