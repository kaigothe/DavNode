import {
  calendarUserAddressesFor,
  CalendarObjectContent,
  deleteCalendarObject,
  deliverAttendeeDecline,
  deliverOrganizerCancellation,
  detectSchedulingRole,
  getEffectiveCalendarLocks,
  hasCalendarPrivilege,
  User,
  type CalendarAclResource,
  type DataSource,
  type SchedulingRole,
  deleteCalendarCollection,
} from '@davnode/core';
import type { Express, Request } from 'express';
import { createAclAuthorizationMiddleware } from '../../acl-authorization.middleware.js';
import {
  checkLockEnforcement,
  createLockEnforcementMiddleware,
  sendLockEnforcementError,
} from '../../lock-enforcement.middleware.js';
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
import { deliverWithoutFailing } from './scheduling-delivery.util.js';

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
 * atomically with the delete. `DELETE` on a calendar (M11) removes it with
 * all its events and is owner-only; on the home it is `405`, on anything
 * deeper `404`.
 *
 * **Scheduling hook** (M7, RFC 6638 §3.2.1.3/§3.2.2.4, "CANCEL-Workflow"):
 * `detectSchedulingRole` decides which side of the event the deleter is
 * on. An `ORGANIZER` deleting their own event has
 * `deliverOrganizerCancellation` send `CANCEL` to every locally
 * resolvable `ATTENDEE` and remove their auto-filed copies, run *after*
 * the delete succeeds. An `ATTENDEE` deleting their own copy without
 * having explicitly declined first is treated as an implicit `DECLINED`
 * (`deliverAttendeeDecline`) and merged into the organizer's own copy
 * *before* the copy itself is actually gone. An ordinary event is
 * completely unaffected.
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
      if (segments.length === 0) {
        // The home is virtual and cannot be removed.
        res.sendStatus(405);
        return;
      }
      if (segments.length === 1) {
        // A calendar. Its home is owner-only (like every home route), so
        // only the owner can remove it; locks on it need their token.
        if (userId !== principal.id) {
          res.sendStatus(403);
          return;
        }
        const calendar = await resolveCalendar(
          dataSource,
          tenant.id,
          userId,
          segments[0],
        );
        if (!calendar) {
          res.sendStatus(404);
          return;
        }
        if (
          !(await checkLockEnforcement(
            dataSource,
            req.header('If'),
            [calendar],
            getEffectiveCalendarLocks,
          ))
        ) {
          sendLockEnforcementError(res);
          return;
        }
        await deleteCalendarCollection(dataSource, calendar);
        res.sendStatus(204);
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

      // Scheduling hook (RFC 6638 §3.2.1.3/§3.2.2.4, M7
      // "CANCEL-Workflow"): only engages for an actual scheduling object
      // resource whose ORGANIZER or one of its ATTENDEEs matches the
      // deleter — an ordinary event is unaffected.
      const targetContent = await dataSource
        .getRepository(CalendarObjectContent)
        .findOneBy({ calendarObjectId: target.id });
      const ics = targetContent?.icsData ?? null;
      let schedulingRole: SchedulingRole = 'none';
      let writerAddresses: string[] = [];
      if (ics !== null) {
        const writer = await dataSource
          .getRepository(User)
          .findOneBy({ principalId: principal.id });
        writerAddresses = writer
          ? calendarUserAddressesFor(writer, tenant)
          : [];
        schedulingRole = detectSchedulingRole(ics, writerAddresses);
      }

      if (schedulingRole === 'attendee' && ics !== null) {
        // An Attendee deleting their own copy without first declining is
        // treated as an implicit DECLINED — delivered and merged into
        // the organizer's copy before the copy itself is actually gone.
        await deliverWithoutFailing(target.uid, () =>
          deliverAttendeeDecline(dataSource, {
            tenant,
            uid: target.uid,
            ics,
            writerAddresses,
          }),
        );
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

      if (schedulingRole === 'organizer' && ics !== null) {
        await deliverWithoutFailing(target.uid, () =>
          deliverOrganizerCancellation(dataSource, {
            tenant,
            uid: target.uid,
            ics,
            organizerPrincipalId: principal.id,
          }),
        );
      }

      res.sendStatus(204);
    },
  );
}
