import {
  buildErrorResponse,
  buildMkcalendarResponse,
  buildMultistatusResponse,
  CALDAV_NAMESPACE,
  CalendarCollection,
  createCalendarCollection,
  interpretMkcalendarProperties,
  isUniqueConstraintViolationError,
  isValidCalendarName,
  MkcalendarBodyError,
  parseMkcalendarRequestBody,
  type DataSource,
  type MkcalendarRequestBody,
} from '@davnode/core';
import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
  type Response,
} from 'express';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from './dav-request.util.js';

/**
 * The largest `MKCALENDAR` body accepted. Real bodies are a few hundred
 * bytes plus, at most, a `VTIMEZONE`; the cap is what lets every
 * property value — however the client splits it — fit the `text` columns
 * MySQL sizes at 64 KiB (Postgres would take more), so a request is
 * refused with `413` up front instead of failing on one engine with a
 * `500` in the database.
 */
const MAX_BODY_BYTES = 48 * 1024;

const APPLICATION_XML = 'application/xml; charset=utf-8';

/** Sends a `403` whose `<D:error>` names the violated CalDAV `precondition` (RFC 4918 §16). */
function sendPrecondition(res: Response, precondition: string): void {
  res
    .status(403)
    .set('Content-Type', APPLICATION_XML)
    .send(
      buildErrorResponse([{ namespace: CALDAV_NAMESPACE, name: precondition }]),
    );
}

/**
 * Turns body-parser's "too large" error into `413`; everything else goes
 * on to the central error handler.
 */
const bodyTooLarge: ErrorRequestHandler = (error, _req, res, next): void => {
  if ((error as { type?: string }).type === 'entity.too.large') {
    res.sendStatus(413);
    return;
  }
  next(error);
};

/**
 * Registers the `MKCALENDAR` route (RFC 4791 §5.3.1) for
 * `/dav/{tenantSlug}/calendars/{userId}{/*splat}` — the way a CalDAV
 * client creates a calendar (its own HTTP method, unlike CardDAV's
 * Extended MKCOL). The last URL segment becomes the calendar's `name`; the
 * optional `<C:mkcalendar>` body sets its properties, all of them or none
 * (see `interpretMkcalendarProperties` for what can be set and how each
 * is treated).
 *
 * **Authorization** is the addressbook home's simple rule, for the same
 * reason (the home collection is synthetic, so there is no `bind` ACE to
 * evaluate): `{userId}` must be the requesting principal's own id, or
 * `403`. The created calendar gets the default-owner ACE in the same
 * transaction, so its owner can use it at once.
 *
 * **Statuses**, in the order they are checked:
 *
 * - `403` — someone else's home; or a location where no calendar can be
 *   created (`CALDAV:calendar-collection-location-ok`): below an existing
 *   calendar (calendars don't nest, §4.2), or a name that is empty, `.`,
 *   `..`, holds control characters, is too long or is one of the names
 *   the scheduling collections will use (`inbox`, `outbox`);
 * - `405` — the home itself, or a calendar of that name exists
 *   (`DAV:resource-must-be-null`);
 * - `409` — the path is deeper than one segment below something that
 *   doesn't exist;
 * - `413` — a body over the size cap; `415` — a body that isn't a
 *   `CALDAV:mkcalendar`; `400` — not well-formed, or not the structure
 *   `<!ELEMENT mkcalendar (DAV:set)>` allows;
 * - `403` + `CALDAV:valid-calendar-data` — the `calendar-timezone` isn't
 *   an iCalendar object with a single `VTIMEZONE`;
 * - `207` — a property that can't be set: it gets its own status, all
 *   others `424`, and no calendar is created;
 * - `201` with `Cache-Control: no-cache` (required by §5.3.1) and a
 *   `<C:mkcalendar-response>` body listing the properties that took
 *   effect.
 *
 * A body is optional (§5.3.1): a bare `MKCALENDAR` creates a calendar
 * named and titled after its URL segment with the default component set.
 */
export function registerMkcalendarRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.mkcalendar(
    '/dav/:tenantSlug/calendars/:userId{/*splat}',
    express.text({ type: () => true, limit: MAX_BODY_BYTES }),
    async (req: Request, res: Response): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = req.params.userId;
      if (userId !== principal.id) {
        res.sendStatus(403);
        return;
      }

      const calendars = dataSource.getRepository(CalendarCollection);
      const segments = pathSegments(req);
      if (segments.length === 0) {
        // The home collection always exists.
        res.sendStatus(405);
        return;
      }
      if (segments.length > 1) {
        const parent = await calendars.findOneBy({
          tenantId: tenant.id,
          ownerPrincipalId: userId,
          name: segments[0],
        });
        if (parent && segments.length === 2) {
          sendPrecondition(res, 'calendar-collection-location-ok');
        } else {
          res.sendStatus(409);
        }
        return;
      }
      const [name] = segments;
      if (!isValidCalendarName(name)) {
        sendPrecondition(res, 'calendar-collection-location-ok');
        return;
      }
      const existing = await calendars.findOneBy({
        tenantId: tenant.id,
        ownerPrincipalId: userId,
        name,
      });
      if (existing) {
        res.sendStatus(405);
        return;
      }

      let body: MkcalendarRequestBody = { properties: [] };
      if (typeof req.body === 'string' && req.body.trim() !== '') {
        try {
          body = parseMkcalendarRequestBody(req.body);
        } catch (error) {
          if (error instanceof MkcalendarBodyError) {
            res.sendStatus(error.kind === 'wrong-root' ? 415 : 400);
            return;
          }
          throw error;
        }
      }

      const interpretation = interpretMkcalendarProperties(body.properties);
      if (interpretation.outcome === 'invalid-timezone') {
        sendPrecondition(res, 'valid-calendar-data');
        return;
      }
      if (interpretation.outcome === 'rejected') {
        res
          .status(207)
          .set('Content-Type', APPLICATION_XML)
          .send(
            buildMultistatusResponse([
              { href: req.path, properties: interpretation.results },
            ]),
          );
        return;
      }

      try {
        await createCalendarCollection(dataSource, {
          tenantId: tenant.id,
          ownerPrincipalId: userId,
          name,
          initialization: interpretation.initialization,
        });
      } catch (error) {
        if (isUniqueConstraintViolationError(error)) {
          // A concurrent MKCALENDAR took the name between the check above
          // and the insert: the transaction rolled back, nothing exists
          // of this attempt.
          res.sendStatus(405);
          return;
        }
        throw error;
      }

      res
        .status(201)
        .set('Cache-Control', 'no-cache')
        .set('Content-Type', APPLICATION_XML)
        .send(buildMkcalendarResponse(interpretation.results));
    },
    bodyTooLarge,
  );
}
