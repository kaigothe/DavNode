import { createHash } from 'node:crypto';
import {
  AddressbookChangeService,
  AddressObject,
  AddressObjectContent,
  createOwnerAllAce,
  indexVCard,
  parseVCard,
  VCardParseError,
  type DataSource,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from '../dav-request.util.js';
import {
  resolveAddressbook,
  resolveAddressObject,
} from './address-object-resolver.js';

/** SHA-256 of `content`, hex-encoded — the same deterministic scheme the WebDAV PUT route uses for `FileResource.etag`. */
function computeEtag(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Registers the PUT route for a single CardDAV contact:
 * `/dav/{tenantSlug}/addressbooks/{userId}/{addressbookName}/{objectName}`
 * (RFC 6352 §6.3.2). Structurally identical to the WebDAV PUT route (M2,
 * `../put.route.ts`) for everything not called out below: `sizeBytes`
 * doesn't apply (`AddressObjectContent` has no matching column), but
 * ETag derivation, `If-Match`, and the `collection_changes` equivalent
 * (`AddressbookChangeService`) all follow the same pattern.
 *
 * **vCard validation, before any write**: the body must parse as a
 * valid vCard (`parseVCard`) — a {@link VCardParseError} means a `400`
 * response, and nothing is written. The target addressbook not existing
 * is `409 Conflict`, matching MKCOL/PUT's own "missing parent" `409` in
 * M2.
 *
 * **UID uniqueness across the whole addressbook, not just this URL**
 * (RFC 6352 §6.3.2): a create whose vCard `UID` already belongs to a
 * *different* `AddressObject` in the same addressbook is `409 Conflict`
 * — this is what `AddressObject.name`/`uid` being independently
 * identified (rather than collapsed into one column) exists to make
 * expressible at all; see the entity's own doc comment.
 *
 * **Access is the same simple, non-ACL-based rule as the other
 * addressbook routes**: `{userId}` must be the requesting principal's
 * own id, or this returns `403`.
 *
 * On success, records an `AddressbookChange` entry (`added` for a new
 * contact, `modified` for an overwrite), bumps the addressbook's
 * `syncSeq`, and (re)populates that contact's `AddressObjectIndex` rows
 * (`indexVCard`) — all in the same transaction as the content write.
 *
 * No quota check yet (M8, see the sub-task's own "Nachtrag" note) — this
 * is where `applyQuotaDelta` will be called once M8 exists.
 */
export function registerCarddavPutRoute(
  app: Express,
  dataSource: DataSource,
): void {
  const addressbookChanges = new AddressbookChangeService();

  app.put(
    '/dav/:tenantSlug/addressbooks/:userId{/*splat}',
    express.text({ type: () => true, limit: '5mb' }),
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
        res.sendStatus(409);
        return;
      }
      const [addressbookName, objectName] = segments;

      const raw = typeof req.body === 'string' ? req.body : '';
      let parsed;
      try {
        parsed = parseVCard(raw);
      } catch (error) {
        if (error instanceof VCardParseError) {
          res.sendStatus(400);
          return;
        }
        throw error;
      }

      const addressbook = await resolveAddressbook(
        dataSource,
        tenant.id,
        userId,
        addressbookName,
      );
      if (!addressbook) {
        res.sendStatus(409);
        return;
      }

      const target = await resolveAddressObject(
        dataSource,
        addressbook.id,
        objectName,
      );

      const conflicting = await dataSource
        .getRepository(AddressObject)
        .findOneBy({ addressbookId: addressbook.id, uid: parsed.uid });
      if (conflicting && conflicting.id !== target?.id) {
        res.sendStatus(409);
        return;
      }

      const etag = computeEtag(raw);

      if (target) {
        const ifMatch = req.header('If-Match');
        if (ifMatch !== undefined && ifMatch !== target.etag) {
          res.sendStatus(412);
          return;
        }

        await dataSource.transaction(async (manager) => {
          const addressObjects = manager.getRepository(AddressObject);
          target.uid = parsed.uid;
          target.etag = etag;
          await addressObjects.save(target);

          await manager
            .getRepository(AddressObjectContent)
            .update({ addressObjectId: target.id }, { vcardData: raw });

          await indexVCard(manager, target.id, parsed);

          await addressbookChanges.recordChange(
            manager,
            addressbook.id,
            objectName,
            'modified',
          );
        });

        res.set('ETag', etag).sendStatus(204);
        return;
      }

      await dataSource.transaction(async (manager) => {
        const addressObjects = manager.getRepository(AddressObject);
        const created = await addressObjects.save(
          addressObjects.create({
            tenantId: tenant.id,
            addressbookId: addressbook.id,
            name: objectName,
            uid: parsed.uid,
            etag,
            ownerPrincipalId: principal.id,
          }),
        );

        const addressObjectContents =
          manager.getRepository(AddressObjectContent);
        await addressObjectContents.save(
          addressObjectContents.create({
            addressObjectId: created.id,
            vcardData: raw,
          }),
        );

        await createOwnerAllAce(
          manager,
          'address-object',
          created.id,
          principal.id,
        );

        await indexVCard(manager, created.id, parsed);

        await addressbookChanges.recordChange(
          manager,
          addressbook.id,
          objectName,
          'added',
        );
      });

      res.set('ETag', etag).sendStatus(201);
    },
  );
}
