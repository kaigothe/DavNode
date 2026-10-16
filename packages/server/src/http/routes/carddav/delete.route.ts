import {
  AddressbookChangeService,
  AddressObject,
  AddressObjectAce,
  AddressObjectContent,
  AddressObjectProperty,
  applyQuotaDelta,
  deleteAddressbookCollection,
  getEffectiveAddressbookLocks,
  hasAddressbookPrivilege,
  User,
  type AddressbookAclResource,
  type DataSource,
} from '@davnode/core';
import type { Express, Request } from 'express';
import { createAclAuthorizationMiddleware } from '../../acl-authorization.middleware.js';
import {
  checkLockEnforcement,
  createLockEnforcementMiddleware,
  sendLockEnforcementError,
} from '../../lock-enforcement.middleware.js';
import {
  addressbookOwnerIdParam,
  pathSegments,
  requirePrincipal,
  requireTenant,
} from '../dav-request.util.js';
import {
  resolveAddressbook,
  resolveAddressObject,
} from './address-object-resolver.js';

/** UTF-8 byte length of `text` — quota is measured in bytes, not characters. */
function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

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
 * **Quota** (M8): the removed `AddressObjectContent`'s UTF-8 byte
 * length is credited back to the contact's owner via `applyQuotaDelta`,
 * read before the delete cascades it away.
 *
 * **Real RFC 3744 ACL, not an owner-only placeholder** (M5 Große
 * Aufgabe 5): deletion needs `unbind` on the addressbook — the parent
 * of the contact being removed, mirroring the WebDAV DELETE route's own
 * "unbind on the parent, not the target" rule. `{userId}` in the URL
 * only identifies whose addressbook this is, not who's allowed to
 * delete from it.
 *
 * **Lock enforcement** (M5 Große Aufgabe 5, instantiating M4 for the
 * addressbook domain): a covering `If`-header token is required for a
 * lock on the target *or* its addressbook (e.g. an unlocked contact
 * inside a `Depth: infinity`-locked addressbook), mirroring the WebDAV
 * DELETE route's own two-resource check. Runs after ACL authorization,
 * so missing privilege is still `403`, not `423`.
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
    createLockEnforcementMiddleware<AddressbookAclResource>(
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
        return target ? { resources: [target, addressbook] } : null;
      },
      getEffectiveAddressbookLocks,
    ),
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const userId = addressbookOwnerIdParam(req);

      const segments = pathSegments(req);
      if (segments.length === 0) {
        // The home is virtual and cannot be removed.
        res.sendStatus(405);
        return;
      }
      if (segments.length === 1) {
        // An addressbook. Its home is owner-only (like every home route),
        // so only the owner can remove it; locks on it need their token.
        if (userId !== requirePrincipal(req).id) {
          res.sendStatus(403);
          return;
        }
        const addressbook = await resolveAddressbook(
          dataSource,
          tenant.id,
          userId,
          segments[0],
        );
        if (!addressbook) {
          res.sendStatus(404);
          return;
        }
        if (
          !(await checkLockEnforcement(
            dataSource,
            req.header('If'),
            [addressbook],
            getEffectiveAddressbookLocks,
          ))
        ) {
          sendLockEnforcementError(res);
          return;
        }
        await deleteAddressbookCollection(dataSource, addressbook);
        res.sendStatus(204);
        return;
      }
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
        // Quota (M8): read before AddressObject's delete cascades
        // AddressObjectContent away; never blocked (a negative delta
        // can't exceed a limit).
        const content = await manager
          .getRepository(AddressObjectContent)
          .findOneByOrFail({ addressObjectId: target.id });
        const owner = await manager
          .getRepository(User)
          .findOneByOrFail({ principalId: target.ownerPrincipalId });
        await applyQuotaDelta(manager, {
          userId: owner.id,
          tenantId: tenant.id,
          deltaBytes: -byteLength(content.vcardData),
        });

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
