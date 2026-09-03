import {
  AddressbookCollection,
  AddressbookHomeCollection,
  AddressbookLiveProperties,
  buildMultistatusResponse,
  parsePropfindRequestBody,
  PropertyProviderRegistry,
  type AddressbookHomeTreeResource,
  type DataSource,
  type MultistatusPropertyResult,
  type MultistatusResourceResult,
  type PropertyProviderContext,
  type PropfindRequestBody,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from './dav-request.util.js';

/**
 * Resolves `segments` (path components after
 * `/addressbooks/:userId/`) within `ownerPrincipalId`'s addressbook
 * home: `[]` is the home collection itself, `[addressbookId]` an
 * actual addressbook owned by that user. Anything deeper (individual
 * address objects) isn't resolved here — that's the AddressObject-CRUD
 * routes' job (Große Aufgabe 4), not yet built.
 *
 * @returns The resolved node, or `null` if `segments` doesn't name a
 * valid path (deeper than one segment, or an addressbook id that
 * doesn't exist or isn't owned by `ownerPrincipalId` in this tenant).
 */
async function resolveAddressbookHomeTreeResource(
  dataSource: DataSource,
  tenantId: string,
  ownerPrincipalId: string,
  segments: readonly string[],
): Promise<AddressbookHomeTreeResource | null> {
  if (segments.length === 0) {
    return new AddressbookHomeCollection(ownerPrincipalId);
  }
  if (segments.length > 1) {
    return null;
  }
  const [addressbookId] = segments;
  return dataSource
    .getRepository(AddressbookCollection)
    .findOneBy({ id: addressbookId, tenantId, ownerPrincipalId });
}

/**
 * `resource`'s direct children (`Depth: 1`) — only the home collection
 * has any (its owner's addressbooks); an individual addressbook has
 * none yet, since address objects aren't resolved by this route.
 */
async function listAddressbookHomeChildren(
  dataSource: DataSource,
  tenantId: string,
  resource: AddressbookHomeTreeResource,
): Promise<AddressbookCollection[]> {
  if (!(resource instanceof AddressbookHomeCollection)) {
    return [];
  }
  return dataSource
    .getRepository(AddressbookCollection)
    .findBy({ tenantId, ownerPrincipalId: resource.ownerPrincipalId });
}

/** The `<D:href>` for `child`, given its already-resolved parent's own href. */
function childHref(parentHref: string, child: AddressbookCollection): string {
  return `${parentHref.replace(/\/$/, '')}/${encodeURIComponent(child.id)}`;
}

/**
 * Resolves the properties `requestBody` asks for against `resource`'s
 * live properties — the addressbook-home analog of PROPFIND's
 * `resolveProperties` (`propfind.route.ts`) and of
 * `principals.route.ts`'s own copy of the same logic, simpler than the
 * WebDAV file tree's since addressbooks have no dead properties of
 * their own yet (PROPPATCH on an addressbook isn't built either — same
 * future scope as address objects, Große Aufgabe 4).
 */
async function resolveProperties(
  resource: AddressbookHomeTreeResource,
  requestBody: PropfindRequestBody,
  registry: PropertyProviderRegistry<AddressbookHomeTreeResource>,
  context: PropertyProviderContext,
): Promise<MultistatusPropertyResult[]> {
  const live = await registry.listLiveProperties(resource, context);

  if (requestBody.kind === 'prop') {
    return requestBody.properties.map((requested) => {
      const found = live.find(
        (p) =>
          p.namespace === requested.namespace && p.name === requested.name,
      );
      return found ? { ...found, status: 200 } : { ...requested, status: 404 };
    });
  }

  if (requestBody.kind === 'propname') {
    return live.map((p) => ({
      namespace: p.namespace,
      name: p.name,
      status: 200,
    }));
  }

  return live.map((p) => ({ ...p, status: 200 }));
}

/**
 * Registers the PROPFIND route for
 * `/dav/{tenantSlug}/addressbooks/{userId}{/*splat}` (RFC 6352 §7.1.1):
 * a user's virtual addressbook home collection, and the actual
 * addressbooks owned by that user beneath it.
 *
 * **Access is intentionally simple, not ACL-based**: `{userId}` must be
 * the requesting principal's own id, or this returns `403` —
 * regardless of whether that id even names a real user, so a caller
 * learns nothing about any identity but their own through this route.
 * No other principal can browse someone else's addressbook home, even
 * with `read` granted on every individual addressbook inside it (a
 * deliberate simplification, same rationale as
 * `registerPrincipalsRoute`'s "no resource-specific ACL check" — this
 * is a discovery/listing endpoint, not the addressbook resources
 * themselves, which get their own ACL-gated CRUD routes in a later
 * milestone task).
 *
 * `Depth` handling matches regular PROPFIND (M2): only `0`/`1` are
 * accepted, everything else (including a missing header, which
 * otherwise defaults to `infinity`) is `403`.
 */
export function registerAddressbookHomeRoute(
  app: Express,
  dataSource: DataSource,
): void {
  const registry =
    new PropertyProviderRegistry<AddressbookHomeTreeResource>();
  registry.register(new AddressbookLiveProperties());

  app.propfind(
    '/dav/:tenantSlug/addressbooks/:userId{/*splat}',
    express.text({ type: () => true }),
    async (req: Request, res): Promise<void> => {
      const depth = req.header('Depth');
      if (depth !== '0' && depth !== '1') {
        res.sendStatus(403);
        return;
      }

      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = req.params.userId;
      if (userId !== principal.id) {
        res.sendStatus(403);
        return;
      }

      const segments = pathSegments(req);
      const target = await resolveAddressbookHomeTreeResource(
        dataSource,
        tenant.id,
        userId,
        segments,
      );
      if (!target) {
        res.sendStatus(404);
        return;
      }

      const requestBody = parsePropfindRequestBody(
        typeof req.body === 'string' ? req.body : null,
      );
      const context: PropertyProviderContext = {
        tenant,
        principal,
        manager: dataSource.manager,
      };

      const resources: MultistatusResourceResult[] = [
        {
          href: req.path,
          properties: await resolveProperties(
            target,
            requestBody,
            registry,
            context,
          ),
        },
      ];

      if (depth === '1') {
        const children = await listAddressbookHomeChildren(
          dataSource,
          tenant.id,
          target,
        );
        for (const child of children) {
          resources.push({
            href: childHref(req.path, child),
            properties: await resolveProperties(
              child,
              requestBody,
              registry,
              context,
            ),
          });
        }
      }

      res
        .status(207)
        .set('Content-Type', 'application/xml; charset=utf-8')
        .send(buildMultistatusResponse(resources));
    },
  );
}
