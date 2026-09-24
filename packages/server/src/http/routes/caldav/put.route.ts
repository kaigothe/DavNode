import { createHash } from 'node:crypto';
import {
  CalendarObjectChangedError,
  CalendarParseError,
  CalendarUidConflictError,
  DAV_NAMESPACE,
  isValidCalendarObjectName,
  MAX_CALENDAR_OBJECT_BYTES,
  parseCalendarObject,
  saveCalendarObject,
  toCalendarObjectUrl,
  type DataSource,
  type ParsedCalendarObject,
} from '@davnode/core';
import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
  type Response,
} from 'express';
import {
  ifMatchSatisfied,
  ifNoneMatchMatches,
} from '../conditional-request.util.js';
import {
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
 * **Authorization is an owner-only placeholder** until Große Aufgabe 5
 * (`{userId}` must be the requesting principal, else `403`); the ACL
 * check will then be `write-content` on the object, or `bind` on the
 * calendar for a new one. PUT on the home or on a calendar itself is
 * `405`; a path deeper than an object is `409`. No lock enforcement or
 * quota yet (Große Aufgabe 5, M8).
 */
export function registerCaldavPutRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.put(
    '/dav/:tenantSlug/calendars/:userId{/*splat}',
    express.text({ type: () => true, limit: MAX_CALENDAR_OBJECT_BYTES }),
    async (req: Request, res: Response): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = req.params.userId as string;
      if (userId !== principal.id) {
        res.sendStatus(403);
        return;
      }

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
        res.sendStatus(409);
        return;
      }

      if (!isSupportedCalendarData(req.header('Content-Type'))) {
        sendCalDavPrecondition(res, 'supported-calendar-data');
        return;
      }
      const ics = typeof req.body === 'string' ? req.body : '';
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

      res.set('ETag', etag).sendStatus(created ? 201 : 204);
    },
    bodyParserErrors,
  );
}
