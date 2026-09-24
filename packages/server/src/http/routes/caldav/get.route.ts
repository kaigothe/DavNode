import { CalendarObjectContent, type DataSource } from '@davnode/core';
import type { Express, Request } from 'express';
import { ifNoneMatchMatches } from '../conditional-request.util.js';
import {
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
 * **Authorization is an owner-only placeholder** until Große Aufgabe 5
 * wires the calendar domain into the RFC 3744 engine (as M5 first did for
 * addressbooks): `{userId}` must be the requesting principal's own id,
 * else `403` — nobody but the owner can reach a calendar yet, so nothing
 * shared can leak in the meantime. The `404`s for a missing calendar or
 * object only follow that check, so a caller learns nothing about
 * anyone else's calendars.
 */
export function registerCaldavGetRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.get(
    '/dav/:tenantSlug/calendars/:userId{/*splat}',
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = req.params.userId as string;
      if (userId !== principal.id) {
        res.sendStatus(403);
        return;
      }

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
      const target = calendar
        ? await resolveCalendarObject(dataSource, calendar.id, objectName)
        : null;
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
