import ICAL from 'ical.js';
import type { BusyInterval } from '../caldav/free-busy-query-report.js';
import { formatUtc } from '../caldav/free-busy-query-report.js';
import { parseSchedulingIcs } from './detect-scheduling-role.js';

/** Thrown by {@link parseFreeBusyRequestMessage} for a structurally invalid request body — an HTTP-level `400`, distinct from a per-`ATTENDEE` outcome (RFC 6638 §5.1: "the client has provided an invalid scheduling message"). */
export class FreeBusyRequestParseError extends Error {}

function invalid(message: string): FreeBusyRequestParseError {
  return new FreeBusyRequestParseError(message);
}

/** A `POST .../outbox/` `freebusy-request` (RFC 6638 §5), parsed. */
export interface FreeBusyRequestMessage {
  /** The `VFREEBUSY`'s `UID`, echoed into every per-`ATTENDEE` reply. */
  uid: string;
  /** Inclusive start of the requested range (`DTSTART`, required to be UTC). */
  rangeStart: Date;
  /** Exclusive end of the requested range (`DTEND`, required to be UTC). */
  rangeEnd: Date;
  /** The `ORGANIZER` calendar user address, echoed into every per-`ATTENDEE` reply. */
  organizerAddress: string;
  /** Every `ATTENDEE` address, in request order — duplicates are not collapsed. */
  attendeeAddresses: string[];
}

/**
 * `time`, as a UTC instant — throws unless `time` is actually anchored to
 * UTC (a trailing `Z`), rather than risk `ICAL.Time#toJSDate()`'s
 * documented floating-time pitfall (it reads a *floating* value in the
 * host process's own time zone). RFC 6638's own example, and every real
 * client this server has been checked against, always sends `DTSTART`/
 * `DTEND` as UTC for a `freebusy-request` — a floating or zoned value
 * here is treated as a malformed request rather than guessed at.
 */
function utcInstantOf(time: unknown, name: string): Date {
  if (!(time instanceof ICAL.Time) || time.zone !== ICAL.Timezone.utcTimezone) {
    throw invalid(`${name} must be a UTC DATE-TIME (a trailing Z).`);
  }
  return time.toJSDate();
}

/**
 * Parses a `freebusy-request` message body (RFC 6638 §5): a `VCALENDAR`
 * with `METHOD:REQUEST` and one `VFREEBUSY` carrying `UID`, `DTSTART`,
 * `DTEND`, `ORGANIZER` and one or more `ATTENDEE`s. Deliberately
 * separate from `parseCalendarObject` (M6): a scheduling message is a
 * different iCalendar "object kind" (RFC 5545 §3.4) than a stored
 * calendar object resource — it *requires* `METHOD` and a `VFREEBUSY`,
 * both of which that parser rejects outright.
 *
 * @throws {@link FreeBusyRequestParseError} If the body isn't
 * structurally valid — never for a problem with one specific
 * `ATTENDEE` (unresolvable, access denied), which the caller reports
 * per RFC 6638 §5's `<C:response>` mechanism instead.
 */
export function parseFreeBusyRequestMessage(
  ics: string,
): FreeBusyRequestMessage {
  let root: ICAL.Component;
  try {
    root = parseSchedulingIcs(ics);
  } catch (error) {
    throw invalid(
      `Not valid iCalendar data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (root.name !== 'vcalendar') {
    throw invalid('The data is not a VCALENDAR.');
  }
  if (root.getFirstPropertyValue('method') !== 'REQUEST') {
    throw invalid('METHOD must be REQUEST.');
  }
  const vfreebusy = root.getFirstSubcomponent('vfreebusy');
  if (!vfreebusy) {
    throw invalid('The VCALENDAR must contain a VFREEBUSY component.');
  }

  const uid = vfreebusy.getFirstPropertyValue('uid');
  if (typeof uid !== 'string' || uid === '') {
    throw invalid('VFREEBUSY needs a UID.');
  }
  const rangeStart = utcInstantOf(
    vfreebusy.getFirstPropertyValue('dtstart'),
    'DTSTART',
  );
  const rangeEnd = utcInstantOf(
    vfreebusy.getFirstPropertyValue('dtend'),
    'DTEND',
  );
  if (rangeEnd <= rangeStart) {
    throw invalid('DTEND must be after DTSTART.');
  }
  const organizerAddress = vfreebusy.getFirstPropertyValue('organizer');
  if (typeof organizerAddress !== 'string' || organizerAddress === '') {
    throw invalid('VFREEBUSY needs an ORGANIZER.');
  }
  const attendeeAddresses = vfreebusy
    .getAllProperties('attendee')
    .map((property) => String(property.getFirstValue()));
  if (attendeeAddresses.length === 0) {
    throw invalid('VFREEBUSY needs at least one ATTENDEE.');
  }

  return { uid, rangeStart, rangeEnd, organizerAddress, attendeeAddresses };
}

/**
 * Builds one `ATTENDEE`'s `VFREEBUSY` `METHOD:REPLY` — the
 * `<C:calendar-data>` of their `<C:response>` block (RFC 6638 §5,
 * Appendix B.5's worked example). `ORGANIZER`/`ATTENDEE` are re-emitted
 * as bare calendar user addresses (any `CN`/other parameters on the
 * original request's properties are not carried over — a deliberate
 * simplification; RFC 6638 doesn't require preserving them).
 */
export function buildFreeBusyReplyForAttendee(
  request: Pick<
    FreeBusyRequestMessage,
    'uid' | 'rangeStart' | 'rangeEnd' | 'organizerAddress'
  >,
  attendeeAddress: string,
  intervals: readonly BusyInterval[],
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//CalDAV Server//EN',
    'METHOD:REPLY',
    'BEGIN:VFREEBUSY',
    `UID:${request.uid}`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${formatUtc(request.rangeStart)}`,
    `DTEND:${formatUtc(request.rangeEnd)}`,
    `ORGANIZER:${request.organizerAddress}`,
    `ATTENDEE:${attendeeAddress}`,
    ...intervals.map(
      (interval) =>
        `FREEBUSY${interval.fbtype === 'BUSY-TENTATIVE' ? ';FBTYPE=BUSY-TENTATIVE' : ''}:` +
        `${formatUtc(new Date(interval.start))}/${formatUtc(new Date(interval.end))}`,
    ),
    'END:VFREEBUSY',
    'END:VCALENDAR',
    '',
  ];
  return lines.join('\r\n');
}
