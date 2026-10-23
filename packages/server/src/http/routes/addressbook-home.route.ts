import {
  AddressbookCollection,
  AddressbookHomeCollection,
  AddressbookLiveProperties,
  buildMultistatusResponse,
  parsePropfindRequestBody,
  PropertyProviderRegistry,
  CollectionSyncProperties,
  DiscoveryPropertiesProvider,
  AddMemberProvider,
  GetctagProvider,
  hasAddressbookPrivilege,
  QuotaPropertiesProvider,
  type AddressbookAclResource,
  type AddressbookHomeTreeResource,
  type DataSource,
  type MultistatusPropertyResult,
  type MultistatusResourceResult,
  type PropertyProviderContext,
  type PropfindRequestBody,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import { createAclAuthorizationMiddleware } from '../acl-authorization.middleware.js';
import {
  addressbookOwnerIdParam,
  pathSegments,
  requirePrincipal,
  requireTenant,
} from './dav-request.util.js';

/**
 * Resolves `segments` (path components after
 * `/addressbooks/:userId/`) within `ownerPrincipalId`'s addressbook
 * home: `[]` is the home collection itself, `[name]` an actual
 * addressbook owned by that user. Anything deeper (individual address
 * objects) isn't resolved here — that's the AddressObject-CRUD routes'
 * job (Große Aufgabe 4), not yet built.
 *
 * Addressbooks are looked up by `displayName`, not by their own row id:
 * an addressbook's URL is whatever path segment its Extended MKCOL
 * request targeted (`addressbook-mkcol.route.ts`), the same way a
 * WebDAV `Collection`'s URL segment *is* its `displayName` (M2) —
 * matching ordinary MKCOL semantics, where a resource is created at the
 * URL the client asked for. `AddressbookCollection.displayName` has no
 * uniqueness constraint at the database level, but MKCOL's own
 * "does something already resolve at this path" check keeps two
 * same-named addressbooks from coexisting under one owner in practice
 * (identical to how `Collection` siblings never collide either).
 *
 * @returns The resolved node, or `null` if `segments` doesn't name a
 * valid path (deeper than one segment, or a name that doesn't match any
 * addressbook owned by `ownerPrincipalId` in this tenant).
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
  const [displayName] = segments;
  return dataSource
    .getRepository(AddressbookCollection)
    .findOneBy({ displayName, tenantId, ownerPrincipalId });
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
  return `${parentHref.replace(/\/$/, '')}/${encodeURIComponent(child.displayName)}`;
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
        (p) => p.namespace === requested.namespace && p.name === requested.name,
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
 * **Whose addressbook home it is**: the home collection itself is
 * private. `{userId}` must be the requesting principal's own id, or this
 * returns `403` — regardless of whether that id even names a real user,
 * so a caller learns nothing about any identity but their own through
 * this route. No other principal can browse someone else's addressbook
 * home, even with `read` granted on every individual addressbook inside
 * it.
 *
 * **An addressbook shared with the requester** is reachable by its path
 * (`/addressbooks/{ownerId}/{name}`), which is how clients subscribe to
 * it (discovery, `getctag`, `sync-token`): RFC 3744 `read` on that
 * addressbook, decided by `hasAddressbookPrivilege` as for GET and
 * REPORT. Without it, or for an addressbook that does not exist, the
 * answer is the same `403`.
 *
 * `Depth` handling matches regular PROPFIND (M2): only `0`/`1` are
 * accepted, everything else (including a missing header, which
 * otherwise defaults to `infinity`) is `403`.
 */
export function registerAddressbookHomeRoute(
  app: Express,
  dataSource: DataSource,
): void {
  const registry = new PropertyProviderRegistry<AddressbookHomeTreeResource>();
  registry.register(new AddressbookLiveProperties());
  registry.register(new QuotaPropertiesProvider<AddressbookHomeTreeResource>());
  registry.register(new GetctagProvider<AddressbookHomeTreeResource>());
  registry.register(new AddMemberProvider<AddressbookHomeTreeResource>());
  registry.register(
    new CollectionSyncProperties<AddressbookHomeTreeResource>(),
  );
  registry.register(
    new DiscoveryPropertiesProvider<AddressbookHomeTreeResource>(),
  );

  app.propfind(
    '/dav/:tenantSlug/addressbooks/:userId{/*splat}',
    createAclAuthorizationMiddleware<AddressbookAclResource>(
      dataSource,
      async (req) => {
        // Only an addressbook below someone else's home needs an ACL
        // check; everything else is decided by the handler (own home, or
        // 403).
        const segments = pathSegments(req);
        const userId = addressbookOwnerIdParam(req);
        if (userId === requirePrincipal(req).id || segments.length !== 1) {
          return null;
        }
        const addressbook = await resolveAddressbookHomeTreeResource(
          dataSource,
          requireTenant(req).id,
          userId,
          segments,
        );
        return addressbook instanceof AddressbookCollection
          ? { resource: addressbook, privilege: 'read' }
          : null;
      },
      hasAddressbookPrivilege,
    ),
    express.text({ type: () => true }),
    async (req: Request, res): Promise<void> => {
      const depth = req.header('Depth');
      if (depth !== '0' && depth !== '1') {
        res.sendStatus(403);
        return;
      }

      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = addressbookOwnerIdParam(req);
      const segments = pathSegments(req);
      const own = userId === principal.id;
      // Someone else's home is private; only one addressbook in it can be
      // reached, and only if the middleware above found `read` on it.
      if (!own && segments.length !== 1) {
        res.sendStatus(403);
        return;
      }

      const target = await resolveAddressbookHomeTreeResource(
        dataSource,
        tenant.id,
        userId,
        segments,
      );
      if (!target) {
        // An addressbook that does not exist under someone else's home is
        // indistinguishable from one the requester may not read.
        res.sendStatus(own ? 404 : 403);
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
