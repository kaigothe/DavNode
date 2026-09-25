import {
  buildMultistatusResponse,
  CALDAV_NAMESPACE,
  DAV_NAMESPACE,
  parsePropfindRequestBody,
  type DataSource,
  type MultistatusPropertyResult,
  type PropfindRequestBody,
  type PropertyValue,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from '../dav-request.util.js';

/**
 * The scheduling Outbox's own, fixed live properties (RFC 6638 §2.2.2:
 * "A scheduling Outbox collection MUST report the DAV:collection and
 * CALDAV:schedule-outbox XML elements in the value of the
 * DAV:resourcetype property"). Unlike the Inbox, there is exactly one of
 * these per user, it is never `PROPPATCH`ed, and it never has children —
 * so this is hand-rolled inline rather than going through a
 * `PropertyProvider`/`PropertyProviderRegistry` for a single, static
 * resource.
 */
const OUTBOX_PROPERTIES: readonly PropertyValue[] = [
  { namespace: DAV_NAMESPACE, name: 'displayname', value: 'outbox' },
  {
    namespace: DAV_NAMESPACE,
    name: 'resourcetype',
    value: `<D:collection xmlns:D="${DAV_NAMESPACE}"/><C:schedule-outbox xmlns:C="${CALDAV_NAMESPACE}"/>`,
  },
];

/** Resolves `requestBody` against {@link OUTBOX_PROPERTIES} — the same `prop`/`propname`/`allprop` semantics every other PROPFIND route uses. */
function resolveOutboxProperties(
  requestBody: PropfindRequestBody,
): MultistatusPropertyResult[] {
  if (requestBody.kind === 'prop') {
    return requestBody.properties.map((requested) => {
      const found = OUTBOX_PROPERTIES.find(
        (p) => p.namespace === requested.namespace && p.name === requested.name,
      );
      return found ? { ...found, status: 200 } : { ...requested, status: 404 };
    });
  }

  if (requestBody.kind === 'propname') {
    return OUTBOX_PROPERTIES.map((p) => ({
      namespace: p.namespace,
      name: p.name,
      status: 200,
    }));
  }

  return OUTBOX_PROPERTIES.map((p) => ({ ...p, status: 200 }));
}

/**
 * Registers the PROPFIND route for
 * `/dav/{tenantSlug}/calendars/{userId}/outbox` (RFC 6638 §2.2.2): always
 * the same, empty collection — the Outbox holds no persisted resources,
 * only the `freebusy-request` handler (`outbox-post.route.ts`, already
 * registered) reacts to `POST`.
 *
 * Registered *before* `registerCalendarHomeRoute` in `app.ts` for the
 * same reason as `registerInboxRoute`: `outbox` is a reserved calendar
 * name, and the broad `/calendars/:userId{/*splat}` PROPFIND route would
 * otherwise answer `404` for it first.
 *
 * **Access is intentionally simple, not ACL-based**: `{userId}` must be
 * the requesting principal's own id, or `403`.
 *
 * @param _dataSource - Unused; kept so this registers the same way as
 * every other route (`registerXRoute(app, dataSource)`) — the Outbox has
 * no persisted resources of its own to query.
 */
export function registerOutboxRoute(
  app: Express,
  _dataSource: DataSource,
): void {
  app.propfind(
    '/dav/:tenantSlug/calendars/:userId/outbox{/*splat}',
    express.text({ type: () => true }),
    (req: Request, res): void => {
      const depth = req.header('Depth');
      if (depth !== '0' && depth !== '1') {
        res.sendStatus(403);
        return;
      }

      requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = req.params.userId as string;
      if (userId !== principal.id) {
        res.sendStatus(403);
        return;
      }

      const segments = pathSegments(req);
      if (segments.length > 0) {
        // The Outbox holds no persisted resources.
        res.sendStatus(404);
        return;
      }

      const requestBody = parsePropfindRequestBody(
        typeof req.body === 'string' ? req.body : null,
      );

      res
        .status(207)
        .set('Content-Type', 'application/xml; charset=utf-8')
        .send(
          buildMultistatusResponse([
            {
              href: req.path,
              properties: resolveOutboxProperties(requestBody),
            },
          ]),
        );
    },
  );
}
