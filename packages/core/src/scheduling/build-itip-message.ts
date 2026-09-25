import ICAL from 'ical.js';
import {
  parseSchedulingIcs,
  schedulingComponentOf,
} from './detect-scheduling-role.js';

/** `PRODID` for every iTIP message this server generates itself (`REPLY`/`CANCEL` — `REQUEST` reuses the organizer's own, unmodified). */
const ITIP_PRODID = '-//DavNode//iTIP//EN';

/** `date`'s UTC wall-clock fields as an `ICAL.Time` — used for every freshly generated `DTSTAMP` (RFC 5546: always "now", never carried over from the source object). */
function utcTimeFor(date: Date): ICAL.Time {
  return ICAL.Time.fromData(
    {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      isDate: false,
    },
    ICAL.Timezone.utcTimezone,
  );
}

/** The `ATTENDEE` property of `component` whose calendar user address equals `address`, case-insensitively — or `null`. */
function findAttendeeProperty(
  component: ICAL.Component,
  address: string,
): ICAL.Property | null {
  const target = address.toLowerCase();
  return (
    component
      .getAllProperties('attendee')
      .find(
        (property) => String(property.getFirstValue()).toLowerCase() === target,
      ) ?? null
  );
}

/**
 * Builds the `METHOD:REQUEST` iTIP message an "Organizer" creating or
 * updating a scheduling object resource sends to its `ATTENDEE`s (RFC
 * 6638 §3.2.1.1/§3.2.1.2, RFC 5546 §3.2.2): the object's own stored text,
 * completely unchanged — master and every `RECURRENCE-ID` override,
 * `SEQUENCE` included — with only `METHOD:REQUEST` added at the
 * `VCALENDAR` level (never present on a stored calendar object resource,
 * RFC 4791 §4.1, so this only ever adds the property, never replaces
 * one).
 *
 * `SEQUENCE` is deliberately **not** touched here: RFC 5546 requires it
 * to reflect the actual revision being announced, and this server bumps
 * it (if the write changed anything schedulable) when it writes the
 * organizer's own event, before this function is ever called — see the
 * organizer-invite-workflow Große Aufgabe.
 *
 * @param ics - The organizer's own stored iCalendar text for the
 * scheduling object resource being created or updated.
 */
export function buildRequestMessage(ics: string): string {
  const root = parseSchedulingIcs(ics);
  root.updatePropertyWithValue('method', 'REQUEST');
  return root.toString();
}

/**
 * Builds the `METHOD:REPLY` iTIP message an "Attendee" sends back to the
 * "Organizer" after changing their own `PARTSTAT` (RFC 6638 §3.2.2.1,
 * RFC 5546 §3.2.3) — a single, reduced `VCALENDAR`/`VEVENT` carrying only
 * what RFC 5546's REPLY table requires or this server chooses to carry:
 * `UID`, `ORGANIZER`, exactly the replying `ATTENDEE`'s own property
 * (with its current `PARTSTAT`), `SEQUENCE` (only if the source had one,
 * copied unchanged — RFC 5546: "MUST be the sequence number of the
 * original REQUEST") and a freshly generated `DTSTAMP`. No `DTSTART`/
 * `SUMMARY`/other event details, and no `RECURRENCE-ID`: this server
 * schedules at the whole-`CalendarObject` level only (planning/
 * 01-decisions.md Runde 22), never a single instance.
 *
 * @param ics - The attendee's own stored iCalendar text (their copy of
 * the scheduling object resource, with their updated `PARTSTAT`).
 * @param respondingAttendeeAddress - The calendar user address (as it
 * appears in the `ATTENDEE` property) of the attendee replying.
 * @throws An `Error` if `ics`'s scheduling component has no `ORGANIZER`,
 * or no `ATTENDEE` matching `respondingAttendeeAddress` — both would
 * mean the caller invoked this on something that isn't actually a
 * scheduling object resource for that attendee, a contract violation
 * `detectSchedulingRole` should have already ruled out upstream.
 */
export function buildReplyMessage(
  ics: string,
  respondingAttendeeAddress: string,
): string {
  const component = schedulingComponentOf(parseSchedulingIcs(ics));
  const organizer = component?.getFirstProperty('organizer') ?? null;
  const attendee = component
    ? findAttendeeProperty(component, respondingAttendeeAddress)
    : null;
  if (!component || !organizer || !attendee) {
    throw new Error(
      `Cannot build a REPLY: no ORGANIZER, or no ATTENDEE matching "${respondingAttendeeAddress}".`,
    );
  }
  const uid = component.getFirstPropertyValue('uid');
  const sequence = component.getFirstProperty('sequence');

  const output = new ICAL.Component(['vcalendar', [], []]);
  output.updatePropertyWithValue('version', '2.0');
  output.updatePropertyWithValue('prodid', ITIP_PRODID);
  output.updatePropertyWithValue('method', 'REPLY');

  const vevent = new ICAL.Component('vevent');
  vevent.addPropertyWithValue('uid', uid);
  vevent.addProperty(organizer);
  vevent.addProperty(attendee);
  if (sequence) {
    vevent.addProperty(sequence);
  }
  vevent.addPropertyWithValue('dtstamp', utcTimeFor(new Date()));
  output.addSubcomponent(vevent);

  return output.toString();
}

/**
 * Builds the `METHOD:CANCEL` iTIP message an "Organizer" sends when
 * removing a scheduling object resource, or removing specific
 * `ATTENDEE`s from one (RFC 6638 §3.2.1.3, RFC 5546 §3.2.5): every
 * `VEVENT` (master and overrides) from `ics`, `SEQUENCE` incremented and
 * `DTSTAMP` refreshed on each, and:
 *
 * - no `cancelledAttendeeAddresses` — the whole event is cancelled:
 *   every component gets `STATUS:CANCELLED`, its `ATTENDEE` list
 *   untouched (RFC 5546: "MUST include some or all Attendees if the
 *   entire event is cancelled");
 * - `cancelledAttendeeAddresses` given — only those attendees are being
 *   uninvited, the event otherwise continues: each component's
 *   `ATTENDEE` list is filtered down to just the named addresses, and
 *   `STATUS` is removed rather than set (RFC 5546: "If uninviting
 *   specific Attendees, then \[STATUS\] MUST NOT be included").
 *
 * @param ics - The organizer's own stored iCalendar text for the
 * scheduling object resource being removed (or partly uninvited).
 * @param cancelledAttendeeAddresses - The calendar user addresses being
 * removed, if this is not a full cancellation.
 */
export function buildCancelMessage(
  ics: string,
  cancelledAttendeeAddresses?: readonly string[],
): string {
  const root = parseSchedulingIcs(ics);
  root.updatePropertyWithValue('method', 'CANCEL');

  const keepAddresses = cancelledAttendeeAddresses
    ? new Set(
        cancelledAttendeeAddresses.map((address) => address.toLowerCase()),
      )
    : null;
  const now = utcTimeFor(new Date());

  for (const component of root.getAllSubcomponents('vevent')) {
    const sequenceProperty = component.getFirstProperty('sequence');
    const currentSequence = sequenceProperty
      ? Number(sequenceProperty.getFirstValue())
      : 0;
    component.updatePropertyWithValue('sequence', currentSequence + 1);
    component.removeAllProperties('dtstamp');
    component.addPropertyWithValue('dtstamp', now);

    if (keepAddresses) {
      component.removeAllProperties('status');
      for (const attendee of component.getAllProperties('attendee')) {
        if (
          !keepAddresses.has(String(attendee.getFirstValue()).toLowerCase())
        ) {
          component.removeProperty(attendee);
        }
      }
    } else {
      component.updatePropertyWithValue('status', 'CANCELLED');
    }
  }

  return root.toString();
}
