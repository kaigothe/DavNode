import {
  AddressbookHomeSetProperty,
  buildMultistatusResponse,
  Group,
  parsePropfindRequestBody,
  PrincipalLiveProperties,
  PropertyProviderRegistry,
  User,
  VirtualPrincipalCollection,
  type DataSource,
  type MultistatusPropertyResult,
  type MultistatusResourceResult,
  type PrincipalTreeResource,
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
 * Resolves `segments` (path components after `/principals/`) within
 * `tenantId`'s principal tree: `[]` is the root, `['users']`/`['groups']`
 * are the two synthetic sub-collections, and `['users', id]`/
 * `['groups', id]` are individual principals — `id` here is the
 * *principal's* id (`User.principalId`/`Group.principalId`, matching
 * `toPrincipalUrl`'s scheme), not the `User`/`Group` row's own `id`.
 *
 * @returns The resolved node, or `null` if `segments` doesn't name a
 * valid path (an unknown top segment, a path deeper than two segments,
 * or a principal id that doesn't exist in this tenant — which also
 * makes a principal from a *different* tenant unreachable here, since
 * the lookup is always scoped by `tenantId`).
 */
async function resolvePrincipalTreeResource(
  dataSource: DataSource,
  tenantId: string,
  segments: readonly string[],
): Promise<PrincipalTreeResource | null> {
  if (segments.length === 0) {
    return new VirtualPrincipalCollection('root');
  }

  const [kindSegment, id, ...rest] = segments;
  if (
    rest.length > 0 ||
    (kindSegment !== 'users' && kindSegment !== 'groups')
  ) {
    return null;
  }
  if (id === undefined) {
    return new VirtualPrincipalCollection(kindSegment);
  }

  return kindSegment === 'users'
    ? dataSource.getRepository(User).findOneBy({ principalId: id, tenantId })
    : dataSource.getRepository(Group).findOneBy({ principalId: id, tenantId });
}

/** `resource`'s direct children (`Depth: 1`) — only the synthetic collection nodes have any; individual principals are leaves. */
async function listPrincipalTreeChildren(
  dataSource: DataSource,
  tenantId: string,
  resource: PrincipalTreeResource,
): Promise<PrincipalTreeResource[]> {
  if (!(resource instanceof VirtualPrincipalCollection)) {
    return [];
  }
  if (resource.kind === 'root') {
    return [
      new VirtualPrincipalCollection('users'),
      new VirtualPrincipalCollection('groups'),
    ];
  }
  return resource.kind === 'users'
    ? dataSource.getRepository(User).findBy({ tenantId })
    : dataSource.getRepository(Group).findBy({ tenantId });
}

/**
 * `resource`'s own path segment, as it appears in its parent's href —
 * for a `User`/`Group`, that's `principalId` (matching the
 * `/dav/{tenant}/principals/{users|groups}/{principal.id}` URL scheme,
 * `principal-url.ts`), **not** the `User`/`Group` row's own `id`.
 */
function resourceName(resource: PrincipalTreeResource): string {
  return resource instanceof VirtualPrincipalCollection
    ? resource.kind
    : resource.principalId;
}

/** The `<D:href>` for `child`, given its already-resolved parent's own href. */
function childHref(
  parentHref: string,
  child: PrincipalTreeResource,
): string {
  return `${parentHref.replace(/\/$/, '')}/${encodeURIComponent(resourceName(child))}`;
}

/**
 * Resolves the properties `requestBody` asks for against `resource`'s
 * live properties, producing the per-property `200`/`404` results
 * {@link buildMultistatusResponse} groups into `<D:propstat>` blocks —
 * the `/principals/` analog of PROPFIND's `resolveProperties`
 * (`propfind.route.ts`), simpler since principals have no dead
 * properties of their own.
 */
async function resolveProperties(
  resource: PrincipalTreeResource,
  requestBody: PropfindRequestBody,
  registry: PropertyProviderRegistry<PrincipalTreeResource>,
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
 * Registers the PROPFIND route for `/dav/{tenantSlug}/principals{/*path}`
 * (RFC 3744 §5.8): the tenant's principal-collection tree —
 * `/principals/`, `/principals/users/`, `/principals/groups/`, and each
 * individual user/group principal — served through the same
 * property-provider mechanism PROPFIND uses for the WebDAV file tree
 * (M2), but through its own `PropertyProviderRegistry<PrincipalTreeResource>`
 * instance, since principals aren't `Collection`/`FileResource` rows.
 *
 * **No resource-specific ACL check**: unlike the file tree, reading the
 * principal list needs no `hasPrivilege` call — any authenticated
 * principal of the tenant can browse it (e.g. to find someone to grant
 * rights to via `ACL`). This is a deliberate simplification, not an
 * oversight: RFC 3744 doesn't mandate ACL-gating principal *discovery*,
 * and every route under `/dav/:tenantSlug` already requires Basic Auth,
 * so this is never reachable unauthenticated.
 *
 * `Depth` handling matches regular PROPFIND (M2): only `0`/`1` are
 * accepted, everything else (including a missing header, which
 * otherwise defaults to `infinity`) is `403`.
 */
export function registerPrincipalsRoute(
  app: Express,
  dataSource: DataSource,
): void {
  const registry = new PropertyProviderRegistry<PrincipalTreeResource>();
  registry.register(new PrincipalLiveProperties());
  registry.register(new AddressbookHomeSetProperty());

  app.propfind(
    '/dav/:tenantSlug/principals{/*splat}',
    express.text({ type: () => true }),
    async (req: Request, res): Promise<void> => {
      const depth = req.header('Depth');
      if (depth !== '0' && depth !== '1') {
        res.sendStatus(403);
        return;
      }

      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const segments = pathSegments(req);
      const target = await resolvePrincipalTreeResource(
        dataSource,
        tenant.id,
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
        const children = await listPrincipalTreeChildren(
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
