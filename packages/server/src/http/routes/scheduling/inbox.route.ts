import {
  buildMultistatusResponse,
  parsePropfindRequestBody,
  PropertyProviderRegistry,
  SchedulingInboxCollection,
  SchedulingInboxItem,
  SchedulingInboxLiveProperties,
  type DataSource,
  type MultistatusPropertyResult,
  type MultistatusResourceResult,
  type PropertyProviderContext,
  type PropfindRequestBody,
  type SchedulingInboxTreeResource,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from '../dav-request.util.js';

/**
 * Resolves `segments` (path components after `/inbox/`) within
 * `ownerPrincipalId`'s scheduling inbox: `[]` is the collection itself,
 * `[itemId]` one of its `SchedulingInboxItem`s (scoped to this tenant and
 * owner, so an id belonging to someone else's inbox never resolves).
 * Mirrors `resolveCalendarHomeTreeResource` (`calendar-home.route.ts`).
 */
async function resolveSchedulingInboxTreeResource(
  dataSource: DataSource,
  tenantId: string,
  ownerPrincipalId: string,
  segments: readonly string[],
): Promise<SchedulingInboxTreeResource | null> {
  if (segments.length === 0) {
    return new SchedulingInboxCollection(ownerPrincipalId);
  }
  if (segments.length > 1) {
    return null;
  }
  const [itemId] = segments;
  return dataSource
    .getRepository(SchedulingInboxItem)
    .findOneBy({ id: itemId, tenantId, ownerPrincipalId });
}

/** `resource`'s direct children (`Depth: 1`) — only the collection has any, its owner's inbox items, oldest first. */
async function listSchedulingInboxChildren(
  dataSource: DataSource,
  tenantId: string,
  resource: SchedulingInboxTreeResource,
): Promise<SchedulingInboxItem[]> {
  if (!(resource instanceof SchedulingInboxCollection)) {
    return [];
  }
  return dataSource.getRepository(SchedulingInboxItem).find({
    where: { tenantId, ownerPrincipalId: resource.ownerPrincipalId },
    order: { createdAt: 'ASC' },
  });
}

/** The `<D:href>` for `child`, given its already-resolved parent's own href. */
function childHref(parentHref: string, child: SchedulingInboxItem): string {
  return `${parentHref.replace(/\/$/, '')}/${child.id}`;
}

/**
 * Resolves the properties `requestBody` asks for against `resource`'s live
 * properties — the scheduling-inbox analog of `calendar-home.route.ts`'s
 * `resolveProperties`, minus dead properties: `SchedulingInboxItem`s are
 * server-generated and never `PROPPATCH`ed.
 */
async function resolveProperties(
  resource: SchedulingInboxTreeResource,
  requestBody: PropfindRequestBody,
  registry: PropertyProviderRegistry<SchedulingInboxTreeResource>,
  context: PropertyProviderContext,
): Promise<MultistatusPropertyResult[]> {
  const all = await registry.listLiveProperties(resource, context);

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
 * Registers the PROPFIND, GET and DELETE routes for
 * `/dav/{tenantSlug}/calendars/{userId}/inbox` (RFC 6638 §2.2.1): a
 * user's scheduling inbox and the `SchedulingInboxItem`s delivered into
 * it.
 *
 * Registered *before* `registerCalendarHomeRoute`/`registerCaldavGetRoute`/
 * `registerCaldavDeleteRoute` in `app.ts` — those match the same broad
 * `/calendars/:userId{/*splat}` path and, since `inbox`/`outbox` are
 * reserved calendar names (`RESERVED_CALENDAR_NAMES`), would otherwise
 * resolve `inbox` as "no such calendar" and answer `404`/`403` themselves
 * before this route is ever reached. Express matches same-method routes
 * in registration order, so the more specific pattern here has to come
 * first.
 *
 * **Access is intentionally simple, not ACL-based**, exactly as for
 * `registerCalendarHomeRoute`: `{userId}` must be the requesting
 * principal's own id, or `403` — a scheduling inbox is a personal
 * mailbox (`SchedulingInboxItem`'s own doc comment), not an ACL-shared
 * resource.
 */
export function registerInboxRoute(app: Express, dataSource: DataSource): void {
  const registry = new PropertyProviderRegistry<SchedulingInboxTreeResource>();
  registry.register(new SchedulingInboxLiveProperties());

  app.propfind(
    '/dav/:tenantSlug/calendars/:userId/inbox{/*splat}',
    express.text({ type: () => true }),
    async (req: Request, res): Promise<void> => {
      const depth = req.header('Depth');
      if (depth !== '0' && depth !== '1') {
        res.sendStatus(403);
        return;
      }

      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = req.params.userId as string;
      if (userId !== principal.id) {
        res.sendStatus(403);
        return;
      }

      const segments = pathSegments(req);
      const target = await resolveSchedulingInboxTreeResource(
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
        const children = await listSchedulingInboxChildren(
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

  app.get(
    '/dav/:tenantSlug/calendars/:userId/inbox/:itemId',
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = req.params.userId as string;
      if (userId !== principal.id) {
        res.sendStatus(403);
        return;
      }

      const item = await dataSource
        .getRepository(SchedulingInboxItem)
        .findOneBy({
          id: req.params.itemId as string,
          tenantId: tenant.id,
          ownerPrincipalId: userId,
        });
      if (!item) {
        res.sendStatus(404);
        return;
      }

      res
        .status(200)
        .set('Content-Type', 'text/calendar; charset=utf-8')
        .set('ETag', item.etag)
        .send(item.icsData);
    },
  );

  app.delete(
    '/dav/:tenantSlug/calendars/:userId/inbox/:itemId',
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = req.params.userId as string;
      if (userId !== principal.id) {
        res.sendStatus(403);
        return;
      }

      const repository = dataSource.getRepository(SchedulingInboxItem);
      const item = await repository.findOneBy({
        id: req.params.itemId as string,
        tenantId: tenant.id,
        ownerPrincipalId: userId,
      });
      if (!item) {
        res.sendStatus(404);
        return;
      }

      await repository.remove(item);
      res.sendStatus(204);
    },
  );
}
