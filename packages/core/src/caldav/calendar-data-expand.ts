import ICAL from 'ical.js';
import { startMs, toInstantMs, type TimeResolution } from './calendar-time.js';
import { ZoneRegistry } from './calendar-zones.js';
import { expandOccurrences } from './expand-recurrence.js';
import type { ParsedCalendarObject } from './icalendar-parser.js';

/** The properties `<C:expand>` forbids in its output (RFC 4791 §9.6.5): the recurrence set is already resolved, so nothing may reference it any more. */
const RECURRENCE_PROPERTY_NAMES = ['rrule', 'rdate', 'exdate', 'exrule'];

/** An `ICAL.Time` for `date`'s UTC wall-clock fields — a plain `DATE` for an all-day occurrence, else UTC `DATE-TIME` (never a floating or zoned one: `<C:expand>` forbids referencing a `VTIMEZONE`, RFC 4791 §9.6.5). */
function icalTimeFor(date: Date, isAllDay: boolean): ICAL.Time {
  const fields = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    isDate: isAllDay,
  };
  return isAllDay
    ? ICAL.Time.fromData(fields)
    : ICAL.Time.fromData(fields, ICAL.Timezone.utcTimezone);
}

/** A deep, independent copy of `source` — `ICAL.Component` has no `clone()`; `toJSON()`'s own doc comment says its jCal is live and must be cloned before use in a new `Component`. */
function cloneComponent(source: ICAL.Component): ICAL.Component {
  return new ICAL.Component(
    JSON.parse(JSON.stringify(source.toJSON())) as ConstructorParameters<
      typeof ICAL.Component
    >[0],
  );
}

/** Replaces `component`'s `property` (removing any prior value, and with it any dangling `TZID` parameter) with `time`. */
function setTimeProperty(
  component: ICAL.Component,
  property: string,
  time: ICAL.Time,
): void {
  component.removeAllProperties(property);
  component.addPropertyWithValue(property, time);
}

/**
 * Renders `parsed`'s occurrences in `[rangeStart, rangeEnd)` as a
 * `VCALENDAR` holding one `VEVENT` per instance (RFC 4791 §9.6.5's
 * `<C:expand>`): every `RRULE`/`RDATE`/`EXDATE` is removed, no
 * `VTIMEZONE` is carried — `DTSTART`, `DTEND` and `RECURRENCE-ID` are
 * all converted to UTC, or, for an all-day event, a plain `DATE` — and
 * every instance, including the first, carries its own `RECURRENCE-ID`
 * (matching real-world CalDAV server behaviour; RFC 4791's own §7.8.3
 * example does the same for every returned instance).
 *
 * Reuses `expandOccurrences` for all the hard correctness — `EXDATE`,
 * override precedence, the instance-count budget — then, for each
 * `Occurrence`, finds the raw `VEVENT` it came from: an override is
 * matched to `parsed.overrides` by its own (deterministic) start
 * instant; a rule-derived instance is a clone of the master with its own
 * start as both `DTSTART` and `RECURRENCE-ID`. Every other property
 * (`SUMMARY`, `ATTENDEE`, ...) is carried over unchanged from that raw
 * component.
 *
 * @param ics - The object's stored iCalendar text (parsed again here for
 * the raw `VEVENT`s' full property sets, which {@link ParsedCalendarObject}
 * doesn't keep).
 * @param parsed - `ics`, already parsed.
 * @param rangeStart - Inclusive start of the range.
 * @param rangeEnd - Exclusive end of the range.
 * @param floatingTimeZone - See {@link resolveReportFloatingTimeZone}.
 * @throws {@link RecurrenceLimitError} Via `expandOccurrences`, if the
 * object's recurrence set is too large to walk to the end of the range.
 */
export function renderExpandedCalendarData(
  ics: string,
  parsed: ParsedCalendarObject,
  rangeStart: Date,
  rangeEnd: Date,
  floatingTimeZone: string | null,
): string {
  const occurrences = expandOccurrences(parsed, rangeStart, rangeEnd, {
    floatingTimeZone,
  });

  const jcal = ICAL.parse(ics) as unknown;
  const root = new ICAL.Component(
    jcal as ConstructorParameters<typeof ICAL.Component>[0],
  );
  const rawVevents = root.getAllSubcomponents('vevent');
  const rawMaster =
    rawVevents.find((component) => !component.hasProperty('recurrence-id')) ??
    null;
  const rawOverrides = rawVevents.filter((component) =>
    component.hasProperty('recurrence-id'),
  );

  const resolution: TimeResolution = {
    zones: new ZoneRegistry(parsed.timezones),
    floatingTimeZone,
  };
  const overrideIndexByStart = new Map<number, number>();
  parsed.overrides.forEach((override, index) => {
    overrideIndexByStart.set(startMs(override, resolution), index);
  });

  const output = new ICAL.Component(['vcalendar', [], []]);
  output.updatePropertyWithValue('version', '2.0');
  output.updatePropertyWithValue('prodid', '-//DavNode//CalDAV Expand//EN');

  for (const occurrence of occurrences) {
    let instance: ICAL.Component;
    let recurrenceId: Date;

    if (occurrence.isOverride) {
      const index = overrideIndexByStart.get(occurrence.start.getTime());
      const raw = index === undefined ? undefined : rawOverrides[index];
      const override =
        index === undefined ? undefined : parsed.overrides[index];
      if (!raw || !override?.recurrenceId) {
        // Not reachable for an object this server itself stored — every
        // Occurrence with isOverride traces back to exactly one
        // parsed.overrides entry — but skip defensively rather than
        // fail the whole rendering for one unmatched instance.
        continue;
      }
      instance = cloneComponent(raw);
      recurrenceId = new Date(toInstantMs(override.recurrenceId, resolution));
    } else {
      if (!rawMaster) {
        continue;
      }
      instance = cloneComponent(rawMaster);
      recurrenceId = occurrence.start;
    }

    for (const name of RECURRENCE_PROPERTY_NAMES) {
      instance.removeAllProperties(name);
    }
    setTimeProperty(
      instance,
      'dtstart',
      icalTimeFor(occurrence.start, occurrence.isAllDay),
    );
    instance.removeAllProperties('duration');
    setTimeProperty(
      instance,
      'dtend',
      icalTimeFor(occurrence.end, occurrence.isAllDay),
    );
    setTimeProperty(
      instance,
      'recurrence-id',
      icalTimeFor(recurrenceId, occurrence.isAllDay),
    );

    output.addSubcomponent(instance);
  }

  return output.toString();
}
