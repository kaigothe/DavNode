import {
  AddressbookCollection,
  buildMkcolResponse,
  CARDDAV_NAMESPACE,
  createOwnerAllAce,
  parseMkcolRequestBody,
  requestsAddressbookResourcetype,
  type DataSource,
  type MultistatusPropertyResult,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from './dav-request.util.js';

/**
 * Registers the Extended MKCOL route (RFC 5689) for
 * `/dav/{tenantSlug}/addressbooks/{userId}{/*splat}`: the RFC
 * 6352-defined way for a CardDAV client to create a new addressbook —
 * *not* a separate server-admin mechanism (see
 * milestones/M5-carddav/00-setting-goal.md). Unlike plain WebDAV's
 * `mkcol.route.ts` (M2), which rejects any request body with `415`
 * (Extended MKCOL wasn't supported yet), this route *requires* one: a
 * `DAV:mkcol` document whose `DAV:resourcetype` includes
 * `CARDDAV:addressbook` (RFC 6352 §5.2). Anything else — no body, a
 * body that isn't well-formed `DAV:mkcol`, or a `resourcetype` that
 * doesn't request an addressbook — is `415`, mirroring the M2 route's
 * own "a body this method doesn't understand" convention (this route
 * doesn't create plain, addressbook-less collections at all).
 *
 * **Target URL, not a server-assigned id**: like a plain WebDAV
 * `Collection`, the new `AddressbookCollection`'s `displayName` — and
 * therefore its own URL segment (`addressbook-home.route.ts` resolves
 * addressbooks by `displayName`) — is exactly the last segment of the
 * request URL. A `DAV:displayname` set in the body is accepted (see the
 * response's `<D:mkcol-response>`) but has no effect on the stored
 * name: honoring a value that differs from the URL would make the
 * addressbook unreachable at the very URL this request just created it
 * at, which defeats the point of resolving by name in the first place.
 * `CARDDAV:addressbook-description`, which has no URL role, *is*
 * honored from the body.
 *
 * **Access is the same simple, non-ACL-based rule as the PROPFIND home
 * route**: `{userId}` must be the requesting principal's own id, or
 * this returns `403`. ACL/lock middleware for the addressbook domain is
 * Große Aufgabe 5's job, not this route's — mirrors
 * `registerAddressbookHomeRoute`'s own rationale.
 *
 * On success, creates the default-owner ACE (`createOwnerAllAce`,
 * `'addressbook'`) in the same transaction as the new row, so the owner
 * can act on their own addressbook immediately (RFC 3744 is
 * default-deny — milestones/M3-webdav-acl/00-setting-goal.md, Runde 19).
 */
export function registerAddressbookMkcolRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.mkcol(
    '/dav/:tenantSlug/addressbooks/:userId{/*splat}',
    express.text({ type: () => true }),
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = req.params.userId;
      if (userId !== principal.id) {
        res.sendStatus(403);
        return;
      }

      const segments = pathSegments(req);
      if (segments.length === 0) {
        // The home collection itself always exists already.
        res.sendStatus(405);
        return;
      }
      if (segments.length > 1) {
        // Addressbooks don't nest (Runde 20) — no intermediate
        // collections are possible under the home.
        res.sendStatus(409);
        return;
      }
      const [newName] = segments;

      if (typeof req.body !== 'string' || req.body.trim() === '') {
        res.sendStatus(415);
        return;
      }

      const body = parseSafely(req.body);
      if (!body || !requestsAddressbookResourcetype(body)) {
        res.sendStatus(415);
        return;
      }

      const existing = await dataSource
        .getRepository(AddressbookCollection)
        .findOneBy({
          tenantId: tenant.id,
          ownerPrincipalId: userId,
          displayName: newName,
        });
      if (existing) {
        res.sendStatus(405);
        return;
      }

      const descriptionProperty = body.properties.find(
        (entry) =>
          entry.property.namespace === CARDDAV_NAMESPACE &&
          entry.property.name === 'addressbook-description',
      );

      await dataSource.transaction(async (manager) => {
        const addressbooks = manager.getRepository(AddressbookCollection);
        const created = await addressbooks.save(
          addressbooks.create({
            tenantId: tenant.id,
            ownerPrincipalId: userId,
            displayName: newName,
            description: descriptionProperty?.value ?? null,
          }),
        );
        await createOwnerAllAce(
          manager,
          'addressbook',
          created.id,
          principal.id,
        );
      });

      const responseProperties: MultistatusPropertyResult[] =
        body.properties.map((entry) => ({
          namespace: entry.property.namespace,
          name: entry.property.name,
          status: 200,
        }));

      res
        .status(201)
        .set('Content-Type', 'application/xml; charset=utf-8')
        .send(buildMkcolResponse(responseProperties));
    },
  );
}

/**
 * Parses `xml` via `parseMkcolRequestBody`, returning `null` instead of
 * throwing for anything not well-formed `DAV:mkcol` — this route treats
 * that the same as any other body it doesn't understand (`415`, see
 * the module doc comment), not a `500`.
 */
function parseSafely(
  xml: string,
): ReturnType<typeof parseMkcolRequestBody> | null {
  try {
    return parseMkcolRequestBody(xml);
  } catch {
    return null;
  }
}
