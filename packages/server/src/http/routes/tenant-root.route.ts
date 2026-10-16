import {
  buildMultistatusResponse,
  DAV_NAMESPACE,
  DiscoveryPropertiesProvider,
  parsePropfindRequestBody,
  PropertyProviderRegistry,
  type DataSource,
  type MultistatusPropertyResult,
  type PropertyProvider,
  type PropertyProviderContext,
  type PropertyValue,
  type PropfindRequestBody,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import { requirePrincipal, requireTenant } from './dav-request.util.js';

/** The tenant's top-level collections, which exist only as URL prefixes. */
const CHILDREN = ['files', 'calendars', 'addressbooks', 'principals'] as const;

/** `/dav/{tenant}/` itself (`name` is `null`) or one of its fixed children. */
class TenantRootResource {
  constructor(readonly name: (typeof CHILDREN)[number] | null) {}
}

/** `displayname` and `resourcetype` for the synthetic collections of the tenant root. */
class TenantRootLiveProperties implements PropertyProvider<TenantRootResource> {
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface; the values come from the request context.
  async listLiveProperties(
    resource: TenantRootResource,
    context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    return [
      {
        namespace: DAV_NAMESPACE,
        name: 'displayname',
        value: (resource.name ?? context.tenant.name)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;'),
      },
      {
        namespace: DAV_NAMESPACE,
        name: 'resourcetype',
        value: `<D:collection xmlns:D="${DAV_NAMESPACE}"/>`,
      },
    ];
  }

  isLiveProperty(namespace: string, name: string): boolean {
    return (
      namespace === DAV_NAMESPACE &&
      (name === 'displayname' || name === 'resourcetype')
    );
  }
}

async function resolveProperties(
  resource: TenantRootResource,
  requestBody: PropfindRequestBody,
  registry: PropertyProviderRegistry<TenantRootResource>,
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
 * Registers PROPFIND for `/dav/{tenantSlug}/` itself (M11, client
 * discovery). Clients that were given only a base URL ask it for
 * `DAV:current-user-principal` to find the user's principal and from there
 * the calendar and addressbook homes (RFC 5397, RFC 6764 §6); without this
 * route that first request ended in a 404. The root is a synthetic
 * collection whose children are the four fixed trees (`files`, `calendars`,
 * `addressbooks`, `principals`); like the principals tree it needs no ACL,
 * since it only names the trees.
 *
 * `Depth` handling matches the other PROPFIND routes: `0` or `1`, anything
 * else (including no header) is `403`.
 */
export function registerTenantRootRoute(
  app: Express,
  _dataSource: DataSource,
): void {
  const registry = new PropertyProviderRegistry<TenantRootResource>();
  registry.register(new TenantRootLiveProperties());
  registry.register(new DiscoveryPropertiesProvider<TenantRootResource>());

  app.propfind(
    '/dav/:tenantSlug',
    express.text({ type: () => true }),
    async (req: Request, res): Promise<void> => {
      const depth = req.header('Depth');
      if (depth !== '0' && depth !== '1') {
        res.sendStatus(403);
        return;
      }
      const tenant = requireTenant(req);
      const context: PropertyProviderContext = {
        tenant,
        principal: requirePrincipal(req),
        manager: _dataSource.manager,
      };
      const requestBody = parsePropfindRequestBody(
        typeof req.body === 'string' ? req.body : null,
      );

      const base = `/dav/${tenant.slug}/`;
      const resources = [
        {
          href: base,
          properties: await resolveProperties(
            new TenantRootResource(null),
            requestBody,
            registry,
            context,
          ),
        },
      ];
      if (depth === '1') {
        for (const name of CHILDREN) {
          resources.push({
            href: `${base}${name}/`,
            properties: await resolveProperties(
              new TenantRootResource(name),
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
