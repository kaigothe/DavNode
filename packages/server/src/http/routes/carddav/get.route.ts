import { AddressObjectContent, type DataSource } from '@davnode/core';
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
 * Whether `headerValue` (an `If-None-Match` header, possibly a
 * comma-separated list, per RFC 7232 §3.2) matches `etag`. Mirrors the
 * WebDAV GET route's own copy of this logic (`get.route.ts`) — see there
 * for the weak-comparison rationale.
 */
function ifNoneMatchMatches(headerValue: string, etag: string): boolean {
  if (headerValue.trim() === '*') {
    return true;
  }
  return headerValue
    .split(',')
    .some((candidate) => candidate.trim().replace(/^W\//, '') === etag);
}

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
 * **Access is the same simple, non-ACL-based rule as the other
 * addressbook routes**: `{userId}` must be the requesting principal's
 * own id, or this returns `403`. ACL wiring for the addressbook domain
 * is a later milestone task's job (Große Aufgabe 5), not this route's.
 */
export function registerCarddavGetRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.get(
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

      const ifNoneMatch = req.header('If-None-Match');
      if (
        ifNoneMatch !== undefined &&
        ifNoneMatchMatches(ifNoneMatch, target.etag)
      ) {
        res.set('ETag', target.etag).sendStatus(304);
        return;
      }

      const content = await dataSource
        .getRepository(AddressObjectContent)
        .findOneByOrFail({ addressObjectId: target.id });

      res
        .status(200)
        .set('Content-Type', 'text/vcard; charset=utf-8')
        .set('ETag', target.etag)
        .send(content.vcardData);
    },
  );
}
