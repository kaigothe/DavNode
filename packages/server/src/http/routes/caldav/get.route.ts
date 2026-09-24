import {
  CalendarObjectContent,
  hasCalendarPrivilege,
  type CalendarAclResource,
  type DataSource,
} from '@davnode/core';
import type { Express, Request } from 'express';
import { createAclAuthorizationMiddleware } from '../../acl-authorization.middleware.js';
import { ifNoneMatchMatches } from '../conditional-request.util.js';
import {
  calendarOwnerIdParam,
  pathSegments,
  requirePrincipal,
  requireTenant,
} from '../dav-request.util.js';
import {
  resolveCalendar,
  resolveCalendarObject,
} from './calendar-object-resolver.js';

/**
 * Registers the GET route for a single calendar object resource:
 * `/dav/{tenantSlug}/calendars/{userId}/{calendarName}/{objectName}`
 * (RFC 4791 §5.3.4). Structurally the CardDAV GET route (M5), with the
 * `Content-Type` always `text/calendar; charset=utf-8` and the strong
 * `ETag` header §5.3.4 requires on every GET; `If-None-Match` answers
 * `304` for an unchanged object.
 *
 * **Real RFC 3744 ACL**: `{userId}` in the URL identifies whose calendar
 * this is, not who may read it — access is `read`, decided by
 * `hasCalendarPrivilege` against the object (which inherits its
 * calendar's ACEs). A calendar that exists but doesn't hold the object is
 * checked for `read` too, so someone without access gets `403` whether or
 * not the name exists, and only a reader learns that an object is missing
 * (`404`). A calendar that doesn't exist under someone *else's* home is
 * `403` as well — the same "learn nothing about any identity but your own"
 * rule the home routes follow — and `404` only under the requester's own.
 */
export function registerCaldavGetRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.get(
    '/dav/:tenantSlug/calendars/:userId{/*splat}',
    createAclAuthorizationMiddleware<CalendarAclResource>(
      dataSource,
      async (req) => {
        const tenant = requireTenant(req);
        const userId = calendarOwnerIdParam(req);
        const segments = pathSegments(req);
        if (segments.length !== 2) {
          return null;
        }
        const [calendarName, objectName] = segments;
        const calendar = await resolveCalendar(
          dataSource,
          tenant.id,
          userId,
          calendarName,
        );
        if (!calendar) {
          return null;
        }
        const target = await resolveCalendarObject(
          dataSource,
          calendar.id,
          objectName,
        );
        return { resource: target ?? calendar, privilege: 'read' };
      },
      hasCalendarPrivilege,
    ),
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = calendarOwnerIdParam(req);

      const segments = pathSegments(req);
      if (segments.length !== 2) {
        res.sendStatus(404);
        return;
      }
      const [calendarName, objectName] = segments;

      const calendar = await resolveCalendar(
        dataSource,
        tenant.id,
        userId,
        calendarName,
      );
      if (!calendar) {
        res.sendStatus(userId === principal.id ? 404 : 403);
        return;
      }
      const target = await resolveCalendarObject(
        dataSource,
        calendar.id,
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
        .getRepository(CalendarObjectContent)
        .findOneByOrFail({ calendarObjectId: target.id });

      res
        .status(200)
        .set('Content-Type', 'text/calendar; charset=utf-8')
        .set('ETag', target.etag)
        .send(content.icsData);
    },
  );
}
