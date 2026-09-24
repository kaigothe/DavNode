import {
  deleteCalendarObject,
  getEffectiveCalendarLocks,
  hasCalendarPrivilege,
  type CalendarAclResource,
  type DataSource,
} from '@davnode/core';
import type { Express, Request } from 'express';
import { createAclAuthorizationMiddleware } from '../../acl-authorization.middleware.js';
import { createLockEnforcementMiddleware } from '../../lock-enforcement.middleware.js';
import { ifMatchSatisfied } from '../conditional-request.util.js';
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
 * Registers the DELETE route for a single calendar object resource:
 * `/dav/{tenantSlug}/calendars/{userId}/{calendarName}/{objectName}`.
 * `deleteCalendarObject` removes the object with its content, dead
 * properties, ACEs and locks — and, as the time-range index lives in the
 * object's own columns, its index — and records the `deleted` change in
 * one transaction.
 *
 * **Real RFC 3744 ACL**: deletion needs `unbind` on the calendar — the
 * parent of the object being removed, mirroring the WebDAV and CardDAV
 * DELETE routes' "unbind on the parent, not the target" rule. It is
 * checked whether or not the object exists, and a calendar that doesn't
 * exist under someone else's home is `403` (see the GET route for why),
 * so nothing leaks to a caller without access.
 *
 * **Lock enforcement**: a covering `If`-header token is required for a
 * lock on the object *or* its calendar (e.g. an unlocked event inside a
 * `Depth: infinity`-locked calendar). Runs after the ACL check, so a
 * missing privilege is still `403`, not `423`.
 *
 * **Conditional**: `If-Match` (a client deleting an object it last saw as
 * such-and-such) fails with `412` when the ETag has moved on, checked
 * atomically with the delete. Only single objects are deletable here —
 * `DELETE` on a calendar or the home is `405`, on anything deeper `404`.
 */
export function registerCaldavDeleteRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.delete(
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
        const calendar = await resolveCalendar(
          dataSource,
          tenant.id,
          userId,
          segments[0],
        );
        return calendar ? { resource: calendar, privilege: 'unbind' } : null;
      },
      hasCalendarPrivilege,
    ),
    createLockEnforcementMiddleware<CalendarAclResource>(
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
        return target ? { resources: [target, calendar] } : null;
      },
      getEffectiveCalendarLocks,
    ),
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = calendarOwnerIdParam(req);

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
