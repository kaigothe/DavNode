import {
  AddressObjectContent,
  hasAddressbookPrivilege,
  type AddressbookAclResource,
  type DataSource,
  formatEtag,
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
import { ifNoneMatchMatches } from '../conditional-request.util.js';

/**
 * Registers the GET route for a single CardDAV contact:
 * `/dav/{tenantSlug}/addressbooks/{userId}/{addressbookName}/{objectName}`.
 * Structurally identical to the WebDAV GET route (M2,
 * `../get.route.ts`), with two CardDAV-specific differences: the
 * `Content-Type` is always `text/vcard; charset=utf-8` (never a
 * per-object stored value — every `AddressObject` is a vCard, unlike a
 * `FileResource`, which can be anything), and the path always resolves
 * exactly two segments (`{addressbookName}/{objectName}`) rather than
 * an arbitrary-depth WebDAV path — addressbooks don't nest and have no
 * sub-collections.
 *
 * **Real RFC 3744 ACL, not an owner-only placeholder** (M5 Große
 * Aufgabe 5): `{userId}` in the URL identifies whose addressbook this
 * is, not who's allowed to read it — access is decided by
 * `hasAddressbookPrivilege` (`read`, checked against the target
 * `AddressObject`, which inherits its parent addressbook's ACEs, see
 * `collectAddressbookAces`), the same engine the WebDAV domain's GET
 * route uses. A missing addressbook/contact and a privilege denial are
 * distinguished the usual way: the ACL middleware's resolver returns
 * `null` (skipping the check) whenever it can't find the target,
 * leaving the `404` to this handler's own, identical lookup.
 */
export function registerCarddavGetRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.get(
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
        return target ? { resource: target, privilege: 'read' } : null;
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

      const ifNoneMatch = req.header('If-None-Match');
      if (
        ifNoneMatch !== undefined &&
        ifNoneMatchMatches(ifNoneMatch, target.etag)
      ) {
        res.set('ETag', formatEtag(target.etag)).sendStatus(304);
        return;
      }

      const content = await dataSource
        .getRepository(AddressObjectContent)
        .findOneByOrFail({ addressObjectId: target.id });

      res
        .status(200)
        .set('Content-Type', 'text/vcard; charset=utf-8')
        .set('ETag', formatEtag(target.etag))
        .send(content.vcardData);
    },
  );
}
