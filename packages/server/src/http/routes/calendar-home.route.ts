import {
  buildMultistatusResponse,
  CalendarCollection,
  CalendarHomeCollection,
  CalendarLiveProperties,
  DeadPropertyService,
  parsePropfindRequestBody,
  PropertyProviderRegistry,
  type CalendarHomeTreeResource,
  type DataSource,
  type MultistatusPropertyResult,
  type MultistatusResourceResult,
  type PropertyProviderContext,
  type PropertyValue,
  type PropfindRequestBody,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from './dav-request.util.js';

/**
 * Resolves `segments` (path components after `/calendars/:userId/`)
 * within `ownerPrincipalId`'s calendar home: `[]` is the home collection
 * itself, `[name]` an actual calendar owned by that user. Anything deeper
 * (individual calendar objects) isn't resolved here — those are served by
 * the CalendarObject routes (Große Aufgabe 4) and the CalDAV REPORTs.
 *
 * Calendars are looked up by `name` — the URL path segment the client
 * picked in its `MKCALENDAR` request — which is unique per owner within
 * the tenant (`CalendarCollection`'s `(tenant, owner, name)` index), so
 * at most one calendar matches.
 *
 * @returns The resolved node, or `null` if `segments` doesn't name a
 * valid path (deeper than one segment, or a name that doesn't match any
 * calendar owned by `ownerPrincipalId` in this tenant).
 */
async function resolveCalendarHomeTreeResource(
  dataSource: DataSource,
  tenantId: string,
  ownerPrincipalId: string,
  segments: readonly string[],
): Promise<CalendarHomeTreeResource | null> {
  if (segments.length === 0) {
    return new CalendarHomeCollection(ownerPrincipalId);
  }
  if (segments.length > 1) {
    return null;
  }
  const [name] = segments;
  return dataSource
    .getRepository(CalendarCollection)
    .findOneBy({ name, tenantId, ownerPrincipalId });
}

/**
 * `resource`'s direct children (`Depth: 1`) — only the home collection
 * has any (its owner's calendars, ordered by name for a stable listing);
 * a calendar's own objects are not listed by PROPFIND, the same as an
 * addressbook's contacts: clients read them through the CalDAV REPORTs.
 */
async function listCalendarHomeChildren(
  dataSource: DataSource,
  tenantId: string,
  resource: CalendarHomeTreeResource,
): Promise<CalendarCollection[]> {
  if (!(resource instanceof CalendarHomeCollection)) {
    return [];
  }
  return dataSource.getRepository(CalendarCollection).find({
    where: { tenantId, ownerPrincipalId: resource.ownerPrincipalId },
    order: { name: 'ASC' },
  });
}

/** The `<D:href>` for `child`, given its already-resolved parent's own href. */
function childHref(parentHref: string, child: CalendarCollection): string {
  return `${parentHref.replace(/\/$/, '')}/${encodeURIComponent(child.name)}`;
}

/**
 * Resolves the properties `requestBody` asks for against `resource`'s
 * live properties and, for a calendar, its dead properties (the
 * client-defined ones `MKCALENDAR` stored) — the calendar-home analog of
 * `propfind.route.ts`'s `resolveProperties`. `allprop` and `propname`
 * report every live and dead property; `prop` exactly the requested
 * ones, `404` where a property doesn't exist.
 */
async function resolveProperties(
  resource: CalendarHomeTreeResource,
  requestBody: PropfindRequestBody,
  registry: PropertyProviderRegistry<CalendarHomeTreeResource>,
  deadProperties: DeadPropertyService,
  context: PropertyProviderContext,
): Promise<MultistatusPropertyResult[]> {
  const live = await registry.listLiveProperties(resource, context);
  const dead =
    resource instanceof CalendarCollection
      ? await deadProperties.listForCalendar(resource.id)
      : [];
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
 * Registers the PROPFIND route for
 * `/dav/{tenantSlug}/calendars/{userId}{/*splat}` (RFC 4791 §6.2.1): a
 * user's virtual calendar home collection, and the actual calendars
 * owned by that user beneath it.
 *
 * **Access is intentionally simple, not ACL-based**, exactly as for
 * `registerAddressbookHomeRoute`: `{userId}` must be the requesting
 * principal's own id, or this returns `403` — regardless of whether that
 * id even names a real user, so a caller learns nothing about any
 * identity but their own. Nobody else can browse someone's calendar
 * home, even with `read` granted on every calendar inside it; this is a
 * discovery/listing endpoint, and the calendars themselves get their own
 * ACL-gated routes.
 *
 * `Depth` handling matches regular PROPFIND (M2): only `0`/`1` are
 * accepted, everything else (including a missing header, which
 * otherwise defaults to `infinity`) is `403`.
 */
export function registerCalendarHomeRoute(
  app: Express,
  dataSource: DataSource,
): void {
  const registry = new PropertyProviderRegistry<CalendarHomeTreeResource>();
  registry.register(new CalendarLiveProperties());
  const deadProperties = new DeadPropertyService(dataSource);

  app.propfind(
    '/dav/:tenantSlug/calendars/:userId{/*splat}',
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
      const target = await resolveCalendarHomeTreeResource(
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
            deadProperties,
            context,
          ),
        },
      ];

      if (depth === '1') {
        const children = await listCalendarHomeChildren(
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
