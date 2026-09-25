import { createHash } from 'node:crypto';
import {
  applyNextSequence,
  calendarUserAddressesFor,
  CalendarObjectChangedError,
  CalendarObjectContent,
  CalendarParseError,
  CalendarUidConflictError,
  DAV_NAMESPACE,
  deliverAttendeeReply,
  deliverOrganizerInvites,
  detectSchedulingRole,
  getEffectiveCalendarLocks,
  hasCalendarPrivilege,
  isValidCalendarObjectName,
  MAX_CALENDAR_OBJECT_BYTES,
  parseCalendarObject,
  saveCalendarObject,
  toCalendarObjectUrl,
  User,
  type CalendarAclResource,
  type DataSource,
  type ParsedCalendarObject,
} from '@davnode/core';
import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
  type Response,
} from 'express';
import { createAclAuthorizationMiddleware } from '../../acl-authorization.middleware.js';
import { createLockEnforcementMiddleware } from '../../lock-enforcement.middleware.js';
import {
  ifMatchSatisfied,
  ifNoneMatchMatches,
} from '../conditional-request.util.js';
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
import { sendCalDavPrecondition } from './precondition.util.js';

/** SHA-256 of `content`, hex-encoded — the scheme every PUT route of this server derives its ETag by. */
function computeEtag(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Whether a request's `Content-Type` is one calendar object resources may
 * be submitted as (RFC 4791 §5.3.2.1 `supported-calendar-data`):
 * `text/calendar`, in UTF-8 — the charset iCalendar text is stored and
 * served in, so that what is stored is octet-equal to what was sent and
 * its ETag can stay strong (§5.3.4). A missing header passes; the content
 * itself is judged by the parser.
 */
function isSupportedCalendarData(contentType: string | undefined): boolean {
  if (contentType === undefined) {
    return true;
  }
  const [mediaType, ...parameters] = contentType
    .split(';')
    .map((part) => part.trim());
  if (mediaType.toLowerCase() !== 'text/calendar') {
    return false;
  }
  return parameters.every((parameter) => {
    const [key, ...rest] = parameter.split('=');
    if (key.trim().toLowerCase() !== 'charset') {
      return true;
    }
    const charset = rest.join('=').trim().replace(/^"|"$/g, '').toLowerCase();
    return charset === 'utf-8' || charset === 'utf8';
  });
}

/**
 * Turns the body parser's own refusals into the CalDAV answers for them:
 * a body over the size limit violates `max-resource-size`, a charset the
 * parser doesn't know `supported-calendar-data`, an unsupported
 * `Content-Encoding` is `415`. Anything else goes on to the central error
 * handler.
 */
const bodyParserErrors: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
): void => {
  switch ((error as { type?: string }).type) {
    case 'entity.too.large':
      sendCalDavPrecondition(res, 'max-resource-size');
      return;
    case 'charset.unsupported':
      sendCalDavPrecondition(res, 'supported-calendar-data');
      return;
    case 'encoding.unsupported':
      res.sendStatus(415);
      return;
    default:
      next(error);
  }
};

/** Answers a request whose iCalendar body the parser refused, naming the precondition it violates. */
function sendParseFailure(res: Response, error: CalendarParseError): void {
  sendCalDavPrecondition(res, error.precondition);
}

/**
 * Registers the PUT route for a single calendar object resource:
 * `/dav/{tenantSlug}/calendars/{userId}/{calendarName}/{objectName}`
 * (RFC 4791 §5.3.2), creating or overwriting it. Structurally the CardDAV
 * PUT route (M5) — ETag as a SHA-256 of the body, `If-Match`, the change
 * log, the owner ACE of a new object, `409` for a missing calendar — with
 * the CalDAV preconditions of §5.3.2.1, each answered `403` with its
 * element in a `<D:error>` body, checked in this order:
 *
 * - `supported-calendar-data` — the `Content-Type` is not
 *   `text/calendar` in UTF-8;
 * - `valid-calendar-data`, `valid-calendar-object-resource`,
 *   `supported-calendar-component` — what `parseCalendarObject` finds
 *   wrong with the body (not iCalendar; a violation of §4.1 such as a
 *   `METHOD`, mixed component types or differing `UID`s; a `VTODO`);
 * - `supported-calendar-component` again — the component type isn't in
 *   the calendar's `supportedComponentSet`;
 * - `max-resource-size` — the body exceeds `MAX_CALENDAR_OBJECT_BYTES`.
 *
 * Only then is the `UID` checked (`no-uid-conflict`, `409` with the
 * conflicting resource's `DAV:href`): it must not belong to another object
 * of the calendar, and an existing object keeps its `UID`. All of it —
 * object, content, time-range index, owner ACE, change record — is one
 * transaction (`saveCalendarObject`).
 *
 * **Conditional requests** (RFC 7232): `If-Match` must hold for the
 * existing object (`*` for any) or the PUT fails with `412` — also
 * against a URL that doesn't exist — and is enforced atomically with the
 * write; `If-None-Match: *` (what CalDAV clients send to create) fails
 * with `412` if the URL is taken, and so does a create that loses a race
 * for it.
 *
 * The response carries the new strong `ETag` (`201` created, `204`
 * overwritten): the text is stored exactly as submitted (§5.3.4).
 *
 * **Real RFC 3744 ACL**: overwriting an existing object needs
 * `write-content` on it, creating a new one `bind` on the calendar — the
 * overwrite-vs-create split the WebDAV and CardDAV PUT routes use.
 * `{userId}` in the URL only identifies whose calendar this is. A calendar
 * that doesn't exist is `409` under the requester's own home and `403`
 * under anyone else's, which reveals nothing about identities but their
 * own (see the GET route).
 *
 * **Lock enforcement**: a covering `If`-header token is required for a
 * locked object on overwrite, or a locked calendar on create — the same
 * split as the ACL check, running after it so a missing privilege is `403`,
 * not `423`.
 *
 * PUT on the home or on a calendar itself is `405`; a path deeper than an
 * object is `409`. No quota yet (M8).
 *
 * **Scheduling hook** (M7, RFC 6638 §3.2.1/§3.2.2, "Organizer-"/
 * "Attendee-Workflow"): after a successful save, `detectSchedulingRole`
 * decides which side of the event the writer is on:
 *
 * - `ORGANIZER` — `SEQUENCE` was set to the previously stored value plus
 *   one (`applyNextSequence`, RFC 6638 §3.2.5) before the object was
 *   even stored, and `deliverOrganizerInvites` diffs the previous
 *   `ATTENDEE` list against the new one to send `REQUEST`/`CANCEL` and
 *   auto-file/update/remove each locally resolvable attendee's own
 *   calendar copy;
 * - `ATTENDEE` — `deliverAttendeeReply` compares the writer's own
 *   `PARTSTAT` before and after; only an actual change sends a `REPLY`
 *   to a locally resolvable `ORGANIZER` and merges it into their own
 *   copy (a private-note-only edit, say, delivers nothing).
 *
 * An ordinary event (no `ORGANIZER`/`ATTENDEE`, "die meisten Termine")
 * is completely unaffected.
 */
export function registerCaldavPutRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.put(
    '/dav/:tenantSlug/calendars/:userId{/*splat}',
    express.text({ type: () => true, limit: MAX_CALENDAR_OBJECT_BYTES }),
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
        return target
          ? { resource: target, privilege: 'write-content' }
          : { resource: calendar, privilege: 'bind' };
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
        return { resources: [target ?? calendar] };
      },
      getEffectiveCalendarLocks,
    ),
    async (req: Request, res: Response): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = calendarOwnerIdParam(req);

      const segments = pathSegments(req);
      if (segments.length < 2) {
        // The home or a calendar: not a place to put an object body.
        res.sendStatus(405);
        return;
      }
      if (segments.length > 2) {
        res.sendStatus(409);
        return;
      }
      const [calendarName, objectName] = segments;
      if (!isValidCalendarObjectName(objectName)) {
        res.sendStatus(403);
        return;
      }

      const calendar = await resolveCalendar(
        dataSource,
        tenant.id,
        userId,
        calendarName,
      );
      if (!calendar) {
        res.sendStatus(userId === principal.id ? 409 : 403);
        return;
      }

      if (!isSupportedCalendarData(req.header('Content-Type'))) {
        sendCalDavPrecondition(res, 'supported-calendar-data');
        return;
      }
      let ics = typeof req.body === 'string' ? req.body : '';
      let parsed: ParsedCalendarObject;
      try {
        parsed = parseCalendarObject(ics);
      } catch (error) {
        if (error instanceof CalendarParseError) {
          sendParseFailure(res, error);
          return;
        }
        throw error;
      }
      if (!calendar.supportedComponentSet.includes(parsed.componentType)) {
        sendCalDavPrecondition(res, 'supported-calendar-component');
        return;
      }

      const existing = await resolveCalendarObject(
        dataSource,
        calendar.id,
        objectName,
      );

      // Scheduling hook (RFC 6638 §3.2.1/§3.2.2, M7 "Organizer-"/
      // "Attendee-Workflow"): only engages for an actual scheduling
      // object resource (ORGANIZER + ATTENDEE) whose ORGANIZER or one of
      // its ATTENDEEs matches the writer — everything else (most events)
      // proceeds exactly as before M7 existed.
      const writer = await dataSource
        .getRepository(User)
        .findOneBy({ principalId: principal.id });
      const writerAddresses = writer
        ? calendarUserAddressesFor(writer, tenant)
        : [];
      const schedulingRole = detectSchedulingRole(ics, writerAddresses);
      let oldIcs: string | null = null;
      if (
        (schedulingRole === 'organizer' || schedulingRole === 'attendee') &&
        existing
      ) {
        const existingContent = await dataSource
          .getRepository(CalendarObjectContent)
          .findOneBy({ calendarObjectId: existing.id });
        oldIcs = existingContent?.icsData ?? null;
        if (schedulingRole === 'organizer' && oldIcs !== null) {
          // RFC 6638 §3.2.5: the server MUST ensure SEQUENCE is updated
          // whenever a scheduling object resource is re-announced.
          ics = applyNextSequence(ics, oldIcs);
          parsed = parseCalendarObject(ics);
        }
      }

      const ifMatch = req.header('If-Match');
      if (
        ifMatch !== undefined &&
        !(existing && ifMatchSatisfied(ifMatch, existing.etag))
      ) {
        res.sendStatus(412);
        return;
      }
      const ifNoneMatch = req.header('If-None-Match');
      if (
        ifNoneMatch !== undefined &&
        existing &&
        ifNoneMatchMatches(ifNoneMatch, existing.etag)
      ) {
        res.sendStatus(412);
        return;
      }

      const etag = computeEtag(ics);
      let created: boolean;
      try {
        ({ created } = await saveCalendarObject(dataSource, {
          tenantId: tenant.id,
          calendarId: calendar.id,
          name: objectName,
          ownerPrincipalId: principal.id,
          ics,
          parsed,
          etag,
          existing,
          expectedEtag:
            ifMatch !== undefined && existing ? existing.etag : undefined,
        }));
      } catch (error) {
        if (error instanceof CalendarUidConflictError) {
          sendCalDavPrecondition(res, 'no-uid-conflict', {
            status: 409,
            children: [
              {
                namespace: DAV_NAMESPACE,
                name: 'D:href',
                text: toCalendarObjectUrl(
                  calendar,
                  error.conflictingName,
                  tenant,
                ),
              },
            ],
          });
          return;
        }
        if (error instanceof CalendarObjectChangedError) {
          res.sendStatus(412);
          return;
        }
        throw error;
      }

      if (schedulingRole === 'organizer') {
        await deliverOrganizerInvites(dataSource, {
          tenant,
          uid: parsed.uid,
          newIcs: ics,
          oldIcs,
          organizerPrincipalId: principal.id,
        });
      } else if (schedulingRole === 'attendee' && oldIcs !== null) {
        await deliverAttendeeReply(dataSource, {
          tenant,
          uid: parsed.uid,
          newIcs: ics,
          oldIcs,
          writerAddresses,
        });
      }

      res.set('ETag', etag).sendStatus(created ? 201 : 204);
    },
    bodyParserErrors,
  );
}
