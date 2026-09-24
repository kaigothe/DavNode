import { deleteCalendarObject, type DataSource } from '@davnode/core';
import type { Express, Request } from 'express';
import { ifMatchSatisfied } from '../conditional-request.util.js';
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
 * Registers the DELETE route for a single calendar object resource:
 * `/dav/{tenantSlug}/calendars/{userId}/{calendarName}/{objectName}`.
 * `deleteCalendarObject` removes the object with its content, dead
 * properties, ACEs and locks — and, as the time-range index lives in the
 * object's own columns, its index — and records the `deleted` change in
 * one transaction.
 *
 * **Conditional**: `If-Match` (a client deleting an object it last saw as
 * such-and-such) fails with `412` when the ETag has moved on, checked
 * atomically with the delete. Only single objects are deletable here —
 * `DELETE` on a calendar or the home is `405`, on anything deeper `404`.
 *
 * **Authorization is an owner-only placeholder** until Große Aufgabe 5
 * (`{userId}` must be the requesting principal, else `403`), like the
 * other calendar object routes; the ACL check will then be `unbind` on
 * the calendar.
 */
export function registerCaldavDeleteRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.delete(
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
      if (segments.length < 2) {
        // The home or a calendar: removing a calendar isn't supported.
        res.sendStatus(405);
        return;
      }
      if (segments.length > 2) {
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
      if (!calendar || !target) {
        res.sendStatus(404);
        return;
      }

      const ifMatch = req.header('If-Match');
      if (ifMatch !== undefined && !ifMatchSatisfied(ifMatch, target.etag)) {
        res.sendStatus(412);
        return;
      }

      const deleted = await deleteCalendarObject(dataSource, {
        calendarId: calendar.id,
        object: target,
        expectedEtag: ifMatch === undefined ? undefined : target.etag,
      });
      if (!deleted) {
        // Gone or changed between the lookup and the delete.
        res.sendStatus(ifMatch === undefined ? 404 : 412);
        return;
      }

      res.sendStatus(204);
    },
  );
}
