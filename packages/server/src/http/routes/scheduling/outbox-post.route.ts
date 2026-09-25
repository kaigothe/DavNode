import {
  FreeBusyRequestParseError,
  handleFreeBusyRequest,
  MAX_CALENDAR_OBJECT_BYTES,
  type DataSource,
} from '@davnode/core';
import express, { type Express, type Request, type Response } from 'express';
import { requirePrincipal, requireTenant } from '../dav-request.util.js';

/**
 * Registers `POST /dav/{tenantSlug}/calendars/{userId}/outbox` — the
 * `freebusy-request` handler (RFC 6638 §5, M7 "Scheduling-Outbox"), the
 * one Outbox use case this server supports: a client asks for the busy
 * time of one or more `ATTENDEE`s at once, in a single
 * `VCALENDAR`/`METHOD:REQUEST`/`VFREEBUSY` body.
 *
 * **Authorization**: `{userId}` must be the requesting principal's own
 * id, or `403` — the same simple identity check every other
 * calendar-home-adjacent route uses (RFC 6638 §11.2 also names a real
 * `CALDAV:schedule-send` privilege for this, but per
 * planning — milestones/M7-caldav-scheduling/07-scheduling-privileges-and-routes —
 * Inbox/Outbox access in v1 is deliberately *not* run through the ACL
 * engine at all, "nur der owner_principal_id"; that Große Aufgabe adds
 * the privilege catalog value without wiring real ACE enforcement for
 * it either). The request body's own `ORGANIZER` value is never trusted
 * for authorization — every privilege check inside
 * `handleFreeBusyRequest` runs against this authenticated principal.
 *
 * **Response**: always `200` with a `<C:schedule-response>` body (RFC
 * 6638 §10.1) — a structurally invalid request body is the only `400`;
 * every per-`ATTENDEE` outcome (unresolvable, access denied, success)
 * is instead one `<C:response>` block with its own status, so one bad
 * `ATTENDEE` never fails the whole request.
 */
export function registerOutboxPostRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.post(
    '/dav/:tenantSlug/calendars/:userId/outbox',
    express.text({ type: () => true, limit: MAX_CALENDAR_OBJECT_BYTES }),
    async (req: Request, res: Response): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = req.params.userId as string;
      if (userId !== principal.id) {
        res.sendStatus(403);
        return;
      }

      const requestIcs = typeof req.body === 'string' ? req.body : '';
      let responseXml: string;
      try {
        responseXml = await handleFreeBusyRequest(dataSource, {
          tenant,
          organizerPrincipal: principal,
          requestIcs,
        });
      } catch (error) {
        if (error instanceof FreeBusyRequestParseError) {
          res.sendStatus(400);
          return;
        }
        throw error;
      }

      res
        .status(200)
        .set('Content-Type', 'text/xml; charset=utf-8')
        .send(responseXml);
    },
  );
}
