import {
  AclPropertiesProvider,
  buildMultistatusResponse,
  Collection,
  DeadPropertyService,
  parsePropfindRequestBody,
  PropertyProviderRegistry,
  ResourcePathResolver,
  WebDavLiveProperties,
  type DataSource,
  type MultistatusPropertyResult,
  type MultistatusResourceResult,
  type PropertyProviderContext,
  type PropertyValue,
  type PropfindRequestBody,
  type WebDavResource,
  type WebDavTreeResource,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import { createOwnerOnlyAuthorizationMiddleware } from '../owner-only-authorization.middleware.js';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from './dav-request.util.js';

/** The resource's own path segment: a `Collection`'s `displayName`, or a `FileResource`'s `name`. */
function resourceName(resource: WebDavTreeResource): string {
  return resource instanceof Collection ? resource.displayName : resource.name;
}

/** The `<D:href>` for `child`, given its already-resolved parent's own href. */
function childHref(parentHref: string, child: WebDavTreeResource): string {
  return `${parentHref.replace(/\/$/, '')}/${encodeURIComponent(resourceName(child))}`;
}

/**
 * Resolves the properties `requestBody` asks for against a resource's
 * combined live + dead properties, producing the per-property
 * `200`/`404` results {@link buildMultistatusResponse} groups into
 * `<D:propstat>` blocks (RFC 4918 §9.1):
 *
 * - `allprop`/`propname`: every live and dead property, all `200`.
 *   `propname` omits each property's value (RFC 4918 §14.19 — the
 *   client asked for names only).
 * - `prop`: exactly the requested properties, `200` if found among
 *   live/dead properties, `404` otherwise.
 */
async function resolveProperties(
  resource: WebDavTreeResource,
  requestBody: PropfindRequestBody,
  registry: PropertyProviderRegistry<WebDavResource>,
  deadProperties: DeadPropertyService,
  context: PropertyProviderContext,
): Promise<MultistatusPropertyResult[]> {
  const live = await registry.listLiveProperties(resource, context);
  const dead =
    resource instanceof Collection
      ? await deadProperties.listForCollection(resource.id)
      : await deadProperties.listForFileResource(resource.id);
  const all: PropertyValue[] = [...live, ...dead];

  if (requestBody.kind === 'prop') {
    return requestBody.properties.map((requested) => {
      const found = all.find(
        (p) => p.namespace === requested.namespace && p.name === requested.name,
      );
      return found ? { ...found, status: 200 } : { ...requested, status: 404 };
    });
  }

  if (requestBody.kind === 'propname') {
    return all.map((p) => ({
      namespace: p.namespace,
      name: p.name,
      status: 200,
    }));
  }

  return all.map((p) => ({ ...p, status: 200 }));
}

/**
 * Registers the PROPFIND route for `/dav/{tenantSlug}/files{/*path}`
 * (RFC 4918 §9.1): looks up the target `Collection`/`FileResource`,
 * evaluates `Depth`, and returns a `207 Multi-Status` response built
 * from the WebDAV property-provider/dead-property infrastructure
 * (`milestones/M2-webdav-core/03-webdav-xml-property-infrastructure`).
 *
 * Depth `infinity` is rejected with `403 Forbidden` — RFC 4918 §9.1
 * explicitly permits a server to refuse it to bound the size of a
 * single response, and a missing `Depth` header defaults to
 * `infinity` per the same section, so it's rejected the same way
 * rather than silently treated as `0`.
 */
export function registerPropfindRoute(
  app: Express,
  dataSource: DataSource,
): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);
  const deadProperties = new DeadPropertyService(dataSource);
  const registry = new PropertyProviderRegistry<WebDavResource>();
  registry.register(new WebDavLiveProperties());
  registry.register(new AclPropertiesProvider());

  app.propfind(
    '/dav/:tenantSlug/files{/*splat}',
    express.text({ type: () => true }),
    createOwnerOnlyAuthorizationMiddleware((req) =>
      resourcePathResolver.resolve(requireTenant(req).id, pathSegments(req)),
    ),
    async (req: Request, res): Promise<void> => {
      const depth = req.header('Depth');
      if (depth !== '0' && depth !== '1') {
        res.sendStatus(403);
        return;
      }

      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const segments = pathSegments(req);
      const target = await resourcePathResolver.resolve(tenant.id, segments);
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
            deadProperties,
            context,
          ),
        },
      ];

      if (depth === '1' && target instanceof Collection) {
        const children = await resourcePathResolver.listChildren(target);
        for (const child of children) {
          resources.push({
            href: childHref(req.path, child),
            properties: await resolveProperties(
              child,
              requestBody,
              registry,
              deadProperties,
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
