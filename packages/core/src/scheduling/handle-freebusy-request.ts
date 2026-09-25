import type { DataSource, EntityManager } from 'typeorm';
import { create } from 'xmlbuilder2';
import { hasCalendarPrivilege } from '../acl/evaluate-privilege.js';
import { CALDAV_NAMESPACE } from '../caldav/caldav-namespace.js';
import { resolveReportFloatingTimeZone } from '../caldav/calendar-query-timezone.js';
import {
  coalesce,
  collectCalendarBusyIntervals,
  type BusyInterval,
} from '../caldav/free-busy-query-report.js';
import { CalendarParseError } from '../caldav/icalendar-parser.js';
import { CalendarCollection } from '../entities/calendar-collection.entity.js';
import type { Principal } from '../entities/principal.entity.js';
import type { Tenant } from '../entities/tenant.entity.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import { resolveLocalPrincipalForAddress } from './detect-scheduling-role.js';
import {
  buildFreeBusyReplyForAttendee,
  parseFreeBusyRequestMessage,
  type FreeBusyRequestMessage,
} from './free-busy-request-message.js';

/** iTIP `REQUEST-STATUS` (RFC 5546 §3.6) values this handler ever answers with. */
const REQUEST_STATUS_SUCCESS = '2.0;Success';
/** RFC 5546 §3.6.20 — the `ATTENDEE` address names no local calendar user. */
const REQUEST_STATUS_INVALID_CALENDAR_USER = '3.7;Invalid calendar user';
/** RFC 5546 §3.6.21 — resolvable, but not granted access to any of their calendars. */
const REQUEST_STATUS_NO_AUTHORITY = '3.8;No authority';

/** One `<C:response>` block's content. */
interface AttendeeResponse {
  recipient: string;
  requestStatus: string;
  calendarData?: string;
}

/**
 * Every busy interval `organizerPrincipal` may see across *all* of
 * `attendeePrincipal`'s calendars within `[rangeStart, rangeEnd)`, and
 * whether at least one of those calendars actually granted access.
 *
 * A calendar that doesn't grant `organizerPrincipal` `read-free-busy`
 * (RFC 4791 §6.1.1 aggregates it under `read`/`all`) contributes nothing
 * — silently skipped, exactly like a denied object within one calendar
 * already is (`collectCalendarBusyIntervals`) — rather than failing the
 * whole request. `granted` is `false` only when *every* one of the
 * attendee's calendars (including having none at all) denies access,
 * which is this function's caller's cue for RFC 5546 status `3.8`.
 */
async function collectAttendeeBusyIntervals(
  manager: EntityManager,
  organizerPrincipal: Principal,
  attendeePrincipal: Principal,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ granted: boolean; intervals: BusyInterval[] }> {
  const calendars = await manager
    .getRepository(CalendarCollection)
    .findBy({ ownerPrincipalId: attendeePrincipal.id });

  let granted = false;
  const intervals: BusyInterval[] = [];
  for (const calendar of calendars) {
    if (
      !(await hasCalendarPrivilege(
        manager,
        organizerPrincipal,
        calendar,
        'read-free-busy',
      ))
    ) {
      continue;
    }
    granted = true;

    let floatingTimeZone: string | null;
    try {
      floatingTimeZone = resolveReportFloatingTimeZone(null, calendar);
    } catch (error) {
      if (!(error instanceof CalendarParseError)) {
        throw error;
      }
      floatingTimeZone = null;
    }

    intervals.push(
      ...(await collectCalendarBusyIntervals(
        manager,
        organizerPrincipal,
        calendar,
        rangeStart,
        rangeEnd,
        floatingTimeZone,
      )),
    );
  }
  return { granted, intervals };
}

/** One `<C:response>` for a locally unresolvable `ATTENDEE` (RFC 6638 §5, external attendees aren't delivered to — planning/01-decisions.md Runde 22). */
function invalidCalendarUserResponse(address: string): AttendeeResponse {
  return {
    recipient: address,
    requestStatus: REQUEST_STATUS_INVALID_CALENDAR_USER,
  };
}

async function responseForAttendee(
  manager: EntityManager,
  tenant: Tenant,
  organizerPrincipal: Principal,
  request: FreeBusyRequestMessage,
  attendeeAddress: string,
): Promise<AttendeeResponse> {
  const attendeePrincipal = await resolveLocalPrincipalForAddress(
    manager,
    attendeeAddress,
    tenant,
  );
  if (!attendeePrincipal) {
    return invalidCalendarUserResponse(attendeeAddress);
  }

  const { granted, intervals } = await collectAttendeeBusyIntervals(
    manager,
    organizerPrincipal,
    attendeePrincipal,
    request.rangeStart,
    request.rangeEnd,
  );
  if (!granted) {
    return {
      recipient: attendeeAddress,
      requestStatus: REQUEST_STATUS_NO_AUTHORITY,
    };
  }

  return {
    recipient: attendeeAddress,
    requestStatus: REQUEST_STATUS_SUCCESS,
    calendarData: buildFreeBusyReplyForAttendee(
      request,
      attendeeAddress,
      coalesce(intervals),
    ),
  };
}

/** Builds the `<C:schedule-response>` XML document (RFC 6638 §10.1/§5, Appendix B.5). */
function buildScheduleResponseXml(
  responses: readonly AttendeeResponse[],
): string {
  const doc = create({ version: '1.0', encoding: 'utf-8' }).ele(
    CALDAV_NAMESPACE,
    'C:schedule-response',
  );

  for (const response of responses) {
    const responseElement = doc.ele(CALDAV_NAMESPACE, 'C:response');
    responseElement
      .ele(CALDAV_NAMESPACE, 'C:recipient')
      .ele(DAV_NAMESPACE, 'D:href')
      .txt(response.recipient);
    responseElement
      .ele(CALDAV_NAMESPACE, 'C:request-status')
      .txt(response.requestStatus);
    if (response.calendarData !== undefined) {
      responseElement
        .ele(CALDAV_NAMESPACE, 'C:calendar-data')
        .txt(response.calendarData);
    }
  }

  return doc.end();
}

/** What {@link handleFreeBusyRequest} needs. */
export interface HandleFreeBusyRequestInput {
  tenant: Tenant;
  /** The authenticated principal POSTing to their own scheduling Outbox — the "Organizer" for every privilege check, regardless of what `requestIcs`'s own `ORGANIZER` property claims. */
  organizerPrincipal: Principal;
  /** The raw `freebusy-request` message body. */
  requestIcs: string;
}

/**
 * Handles a `freebusy-request` POST to a scheduling Outbox (RFC 6638
 * §5, M7 "Scheduling-Outbox"): resolves each `ATTENDEE` to a local
 * calendar user (`resolveLocalPrincipalForAddress`, Große Aufgabe 2),
 * computes their aggregate busy time across every one of their own
 * calendars the requester can see (`collectAttendeeBusyIntervals`), and
 * assembles one `<C:response>` per attendee into the `<C:schedule-response>`
 * body — never a single request-wide failure over one attendee's own
 * outcome.
 *
 * The `ORGANIZER` address inside `requestIcs` is echoed into each
 * successful reply's `VFREEBUSY`, but is **not** used for any privilege
 * decision — every check runs against `organizerPrincipal`, the actual
 * authenticated caller (verified by the route to own the Outbox being
 * posted to), so nothing in the request body itself can be used to
 * impersonate a different organizer.
 *
 * @throws {@link FreeBusyRequestParseError} If `requestIcs` isn't a
 * structurally valid `freebusy-request` — the route answers `400` for
 * this; every other outcome (unresolvable or access-denied attendee)
 * is a `200` with that attendee's own `<C:response>` status instead.
 */
export async function handleFreeBusyRequest(
  dataSource: DataSource,
  input: HandleFreeBusyRequestInput,
): Promise<string> {
  const { tenant, organizerPrincipal, requestIcs } = input;
  const request = parseFreeBusyRequestMessage(requestIcs);

  const responses: AttendeeResponse[] = [];
  for (const attendeeAddress of request.attendeeAddresses) {
    responses.push(
      await responseForAttendee(
        dataSource.manager,
        tenant,
        organizerPrincipal,
        request,
        attendeeAddress,
      ),
    );
  }

  return buildScheduleResponseXml(responses);
}
