import ICAL from 'ical.js';
import { ZoneRegistry, type ParsedTimezone } from './calendar-zones.js';
import { CalendarParseError } from './icalendar-parser.js';

/** Instants at which a parsed zone must yield a finite offset to count as usable: a winter and a summer date. */
const PROBE_CLOCKS = [
  { year: 2000, month: 1, day: 15, hour: 12, minute: 0, second: 0 },
  { year: 2020, month: 7, day: 15, hour: 12, minute: 0, second: 0 },
];

function invalid(message: string): CalendarParseError {
  return new CalendarParseError(message, 'valid-calendar-data');
}

/**
 * Validates the value of a `CALDAV:calendar-timezone` property (RFC 4791
 * §5.2.2): "an iCalendar object with exactly one VTIMEZONE component",
 * the condition `CALDAV:valid-calendar-data` guards on `MKCALENDAR`
 * (§5.3.1). Concretely: one `VCALENDAR` with `VERSION:2.0`, holding
 * nothing but a single `VTIMEZONE` that has a `TZID`, at least one
 * `STANDARD`/`DAYLIGHT` observance, and for each of those the
 * `DTSTART`/`TZOFFSETFROM`/`TZOFFSETTO` RFC 5545 §3.6.5 requires — and
 * that {@link ZoneRegistry} can actually evaluate, so a stored time zone
 * never makes a later time-range computation fail.
 *
 * @returns The zone as plain data, in the form {@link ZoneRegistry}
 * takes.
 * @throws {@link CalendarParseError} Always with the
 * `valid-calendar-data` precondition, and a human-readable reason.
 */
export function parseCalendarTimezone(text: string): ParsedTimezone {
  let root: ICAL.Component;
  try {
    const jcal = ICAL.parse(
      text.charCodeAt(0) === 0xfeff ? text.slice(1) : text,
    ) as unknown;
    if (Array.isArray(jcal) && Array.isArray(jcal[0])) {
      throw invalid('The data contains more than one VCALENDAR.');
    }
    root = new ICAL.Component(
      jcal as ConstructorParameters<typeof ICAL.Component>[0],
    );
  } catch (error) {
    if (error instanceof CalendarParseError) {
      throw error;
    }
    throw invalid(
      `Not valid iCalendar data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (root.name !== 'vcalendar') {
    throw invalid('The data is not a VCALENDAR.');
  }
  if (root.getFirstPropertyValue('version') !== '2.0') {
    throw invalid('The VCALENDAR must declare VERSION:2.0.');
  }

  const components = root.getAllSubcomponents();
  const zones = components.filter(
    (component) => component.name === 'vtimezone',
  );
  if (zones.length !== 1 || components.length !== 1) {
    throw invalid(
      'The calendar-timezone must contain exactly one VTIMEZONE and no other component.',
    );
  }
  const [vtimezone] = zones;

  const tzid = vtimezone.getFirstPropertyValue('tzid');
  if (typeof tzid !== 'string' || tzid === '') {
    throw invalid('The VTIMEZONE has no TZID.');
  }
  const observances = [
    ...vtimezone.getAllSubcomponents('standard'),
    ...vtimezone.getAllSubcomponents('daylight'),
  ];
  if (observances.length === 0) {
    throw invalid(`The VTIMEZONE "${tzid}" defines no STANDARD or DAYLIGHT.`);
  }
  for (const observance of observances) {
    for (const required of ['dtstart', 'tzoffsetfrom', 'tzoffsetto']) {
      if (!observance.hasProperty(required)) {
        throw invalid(
          `A ${observance.name.toUpperCase()} of the VTIMEZONE "${tzid}" lacks ${required.toUpperCase()}.`,
        );
      }
    }
  }

  const zone: ParsedTimezone = { tzid, vtimezone: vtimezone.toString() };
  try {
    const registry = new ZoneRegistry([zone]);
    for (const clock of PROBE_CLOCKS) {
      if (!Number.isFinite(registry.offsetSeconds(tzid, clock))) {
        throw new Error('the zone yields no UTC offset');
      }
    }
  } catch (error) {
    throw invalid(
      `The VTIMEZONE "${tzid}" cannot be evaluated: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return zone;
}
