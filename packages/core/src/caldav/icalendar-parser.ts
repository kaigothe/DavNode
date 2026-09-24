import ICAL from 'ical.js';
import type {
  CalendarStatus,
  CalendarTransparency,
} from '../entities/calendar-object.entity.js';
import {
  endMs,
  startMs,
  toIcalTime,
  toInstantMs,
  type TimeResolution,
} from './calendar-time.js';
import {
  UnknownTimezoneError,
  ZoneRegistry,
  utcMillis,
  type ParsedTimezone,
} from './calendar-zones.js';

/**
 * How an iCalendar date or date-time is anchored: `date` (`VALUE=DATE`,
 * an all-day date), `floating` (a local time with no zone), `utc`
 * (trailing `Z`) or `zoned` (a `TZID`).
 */
export type CalendarTimeKind = 'date' | 'floating' | 'utc' | 'zoned';

/**
 * A date or date-time exactly as the iCalendar text writes it: wall-clock
 * fields plus how to read them. Deliberately *not* an instant — a
 * floating time or a `DATE` has none until a zone is chosen (RFC 4791
 * §7.3), and a zoned one needs its `VTIMEZONE`; see `toInstantMs`.
 */
export interface CalendarTime {
  kind: CalendarTimeKind;
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  /** 0 for a `date`. */
  hour: number;
  /** 0 for a `date`. */
  minute: number;
  /** 0 for a `date`. */
  second: number;
  /** The `TZID` for a `zoned` time, else `null`. */
  tzid: string | null;
}

/** One `RDATE` value: a start, and for the `PERIOD` form its end or duration. */
export interface ParsedRecurrenceDate {
  start: CalendarTime;
  /** The period's explicit end, if the value was a `PERIOD` with one. */
  end: CalendarTime | null;
  /** The period's duration text, if the value was a `PERIOD` with one. */
  duration: string | null;
}

/**
 * One `VEVENT`, reduced to what the index and the recurrence expansion
 * need, as plain data (no library objects).
 */
export interface ParsedComponent {
  dtstart: CalendarTime;
  /** The `DTEND`; `null` when the event has a `DURATION` or neither. */
  dtend: CalendarTime | null;
  /** The `DURATION` text (`PT1H`); `null` when the event has a `DTEND` or neither. */
  duration: string | null;
  /** `DTSTART` is a `DATE`: an all-day event. */
  isAllDay: boolean;
  /** The `RRULE` value (`FREQ=WEEKLY;COUNT=10`), or `null`. Always `null` on an override. */
  rrule: string | null;
  /** The `RDATE` values, in document order. Always empty on an override. */
  rdate: ParsedRecurrenceDate[];
  /** The `EXDATE` values, in document order. Always empty on an override. */
  exdate: CalendarTime[];
  /** The `RECURRENCE-ID` — set exactly on overrides. */
  recurrenceId: CalendarTime | null;
  /** `TRANSP`; `opaque` unless it says `TRANSPARENT`. */
  transparency: CalendarTransparency;
  /** `STATUS`; `null` if absent or not one of the three defined values. */
  status: CalendarStatus | null;
  /** `SUMMARY`, if any. */
  summary: string | null;
}

/**
 * A calendar object resource (RFC 4791 §4.1) as plain data: the
 * components sharing one `UID` — the master recurring/one-off event
 * and/or its `RECURRENCE-ID` overrides — and the `VTIMEZONE`s they use.
 */
export interface ParsedCalendarObject {
  /** The `UID` all components share. */
  uid: string;
  /** v1 stores `VEVENT`s only. */
  componentType: 'VEVENT';
  /**
   * The component without `RECURRENCE-ID` (it defines the recurrence
   * set), or `null` for an object holding only overrides — which RFC
   * 4791 §4.1 explicitly allows, e.g. an invitation to a single instance
   * of someone else's series.
   */
  master: ParsedComponent | null;
  /** The `RECURRENCE-ID` components, each replacing one instance. */
  overrides: ParsedComponent[];
  /** The `VTIMEZONE`s the object carries. */
  timezones: ParsedTimezone[];
}

/**
 * The CalDAV precondition (RFC 4791 §5.3.2.1) a rejected calendar object
 * violates — what the PUT handler reports back in its `<D:error>` body.
 */
export type CalendarPrecondition =
  | 'valid-calendar-data'
  | 'valid-calendar-object-resource'
  | 'supported-calendar-component';

/**
 * Thrown by {@link parseCalendarObject} when text can't be stored as a
 * calendar object resource. `precondition` says which CalDAV
 * precondition it violates; `message` is a human-readable reason.
 */
export class CalendarParseError extends Error {
  /**
   * @param message - What is wrong with the calendar object.
   * @param precondition - The RFC 4791 precondition it violates.
   */
  constructor(
    message: string,
    readonly precondition: CalendarPrecondition,
  ) {
    super(message);
    this.name = 'CalendarParseError';
  }
}

/** A leading byte order mark some editors and clients prepend to UTF-8 text. */
function stripByteOrderMark(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z?)$/;

/** The parts of a jCal property: `[name, parameters, valueType, ...values]`. */
type JCalProperty = [string, Record<string, unknown>, string, ...unknown[]];

function invalidData(message: string): CalendarParseError {
  return new CalendarParseError(message, 'valid-calendar-data');
}

function invalidResource(message: string): CalendarParseError {
  return new CalendarParseError(message, 'valid-calendar-object-resource');
}

/** Turns one jCal `date`/`date-time` value into a {@link CalendarTime}. */
function parseTimeValue(
  name: string,
  type: string,
  value: unknown,
  tzid: unknown,
): CalendarTime {
  const text = typeof value === 'string' ? value : '';
  let time: CalendarTime;
  if (type === 'date') {
    const match = DATE_PATTERN.exec(text);
    if (!match) {
      throw invalidData(`${name} is not a valid DATE value.`);
    }
    time = {
      kind: 'date',
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: 0,
      minute: 0,
      second: 0,
      tzid: null,
    };
  } else if (type === 'date-time') {
    const match = DATE_TIME_PATTERN.exec(text);
    if (!match) {
      throw invalidData(`${name} is not a valid DATE-TIME value.`);
    }
    const isUtc = match[7] === 'Z';
    const zone = typeof tzid === 'string' && tzid !== '' ? tzid : null;
    time = {
      kind: isUtc ? 'utc' : zone !== null ? 'zoned' : 'floating',
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6]),
      tzid: isUtc ? null : zone,
    };
  } else {
    throw invalidData(`${name} must be a DATE or DATE-TIME value.`);
  }

  // Reject what the date doesn't have (February 30th, hour 25, ...).
  const check = new Date(
    utcMillis({
      year: time.year,
      month: time.month,
      day: time.day,
      hour: time.hour,
      minute: time.minute,
      second: Math.min(time.second, 59),
    }),
  );
  if (
    time.year < 1 ||
    check.getUTCFullYear() !== time.year ||
    check.getUTCMonth() + 1 !== time.month ||
    check.getUTCDate() !== time.day ||
    check.getUTCHours() !== time.hour ||
    check.getUTCMinutes() !== time.minute ||
    time.second > 60
  ) {
    throw invalidData(`${name} is not a real date or time.`);
  }
  return time;
}

/** The single property `name` of `component`, or `null`; more than one is invalid. */
function singleProperty(
  component: ICAL.Component,
  name: string,
): JCalProperty | null {
  const properties = component.getAllProperties(name);
  if (properties.length > 1) {
    throw invalidData(`${name.toUpperCase()} must occur at most once.`);
  }
  return properties.length === 0
    ? null
    : (properties[0].toJSON() as JCalProperty);
}

function readTime(
  component: ICAL.Component,
  name: string,
): CalendarTime | null {
  const property = singleProperty(component, name);
  if (!property) {
    return null;
  }
  const [, params, type, value] = property;
  return parseTimeValue(name.toUpperCase(), type, value, params.tzid);
}

function readDuration(component: ICAL.Component): string | null {
  const property = singleProperty(component, 'duration');
  if (!property) {
    return null;
  }
  const text = String(property[3]);
  let seconds: number;
  try {
    seconds = ICAL.Duration.fromString(text).toSeconds();
  } catch {
    throw invalidData('DURATION is not a valid duration.');
  }
  if (seconds < 0) {
    throw invalidData('DURATION must not be negative.');
  }
  return text;
}

function readRecurrenceDates(
  component: ICAL.Component,
): ParsedRecurrenceDate[] {
  const dates: ParsedRecurrenceDate[] = [];
  for (const property of component.getAllProperties('rdate')) {
    const [, params, type, ...values] = property.toJSON() as JCalProperty;
    for (const value of values) {
      if (type === 'period') {
        const [start, endOrDuration] = value as [string, string];
        const startTime = parseTimeValue(
          'RDATE',
          'date-time',
          start,
          params.tzid,
        );
        if (/^[+-]?P/.test(endOrDuration)) {
          dates.push({ start: startTime, end: null, duration: endOrDuration });
        } else {
          dates.push({
            start: startTime,
            end: parseTimeValue(
              'RDATE',
              'date-time',
              endOrDuration,
              params.tzid,
            ),
            duration: null,
          });
        }
      } else {
        dates.push({
          start: parseTimeValue('RDATE', type, value, params.tzid),
          end: null,
          duration: null,
        });
      }
    }
  }
  return dates;
}

function readExceptionDates(component: ICAL.Component): CalendarTime[] {
  const dates: CalendarTime[] = [];
  for (const property of component.getAllProperties('exdate')) {
    const [, params, type, ...values] = property.toJSON() as JCalProperty;
    for (const value of values) {
      dates.push(parseTimeValue('EXDATE', type, value, params.tzid));
    }
  }
  return dates;
}

function readRule(component: ICAL.Component): string | null {
  const property = singleProperty(component, 'rrule');
  if (!property) {
    return null;
  }
  try {
    return ICAL.Recur.fromData(
      property[3] as Parameters<typeof ICAL.Recur.fromData>[0],
    ).toString();
  } catch {
    throw invalidData('RRULE is not a valid recurrence rule.');
  }
}

/** Reads one `VEVENT` into a {@link ParsedComponent}, without resolving any zone yet. */
function extractComponent(component: ICAL.Component): ParsedComponent {
  const dtstart = readTime(component, 'dtstart');
  if (!dtstart) {
    throw invalidData('A VEVENT without DTSTART is not valid.');
  }
  const dtend = readTime(component, 'dtend');
  const duration = readDuration(component);
  if (dtend && duration !== null) {
    throw invalidData('A VEVENT must not have both DTEND and DURATION.');
  }
  if (dtend && (dtend.kind === 'date') !== (dtstart.kind === 'date')) {
    throw invalidData('DTSTART and DTEND must both be DATE or both DATE-TIME.');
  }
  const recurrenceId = readTime(component, 'recurrence-id');
  const isOverride = recurrenceId !== null;

  const transparency = component.getFirstPropertyValue('transp');
  const status = String(component.getFirstPropertyValue('status') ?? '')
    .toLowerCase()
    .trim();
  const summary = component.getFirstPropertyValue('summary');

  return {
    dtstart,
    dtend,
    duration,
    isAllDay: dtstart.kind === 'date',
    // An override replaces one instance; it doesn't recur itself.
    rrule: isOverride ? null : readRule(component),
    rdate: isOverride ? [] : readRecurrenceDates(component),
    exdate: isOverride ? [] : readExceptionDates(component),
    recurrenceId,
    transparency:
      typeof transparency === 'string' &&
      transparency.toUpperCase() === 'TRANSPARENT'
        ? 'transparent'
        : 'opaque',
    status:
      status === 'tentative' || status === 'confirmed' || status === 'cancelled'
        ? status
        : null,
    summary: typeof summary === 'string' ? summary : null,
  };
}

function timeKey(time: CalendarTime): string {
  return `${time.kind}|${time.tzid ?? ''}|${time.year}-${time.month}-${time.day}T${time.hour}:${time.minute}:${time.second}`;
}

/**
 * Checks what only zone resolution can: every `TZID` resolves, no event
 * ends before it starts, and a recurrence rule the library can iterate.
 */
function validateTimes(parsed: ParsedCalendarObject): void {
  const resolution: TimeResolution = {
    zones: new ZoneRegistry(parsed.timezones),
    floatingTimeZone: null,
  };
  try {
    for (const component of [
      ...(parsed.master ? [parsed.master] : []),
      ...parsed.overrides,
    ]) {
      const start = startMs(component, resolution);
      if (endMs(component, resolution) < start) {
        throw invalidData('DTEND is before DTSTART.');
      }
      for (const time of [
        ...component.exdate,
        ...component.rdate.map((rdate) => rdate.start),
        ...(component.recurrenceId ? [component.recurrenceId] : []),
      ]) {
        toInstantMs(time, resolution);
      }
      if (component.rrule !== null) {
        try {
          new ICAL.RecurIterator({
            rule: ICAL.Recur.fromString(component.rrule),
            dtstart: toIcalTime(component.dtstart, resolution),
            initialized: false,
          }).next();
        } catch {
          throw invalidData('RRULE cannot be evaluated.');
        }
      }
    }
  } catch (error) {
    if (error instanceof UnknownTimezoneError) {
      throw invalidResource(error.message);
    }
    throw error;
  }
}

/**
 * Parses iCalendar text (RFC 5545) into a {@link ParsedCalendarObject},
 * enforcing what RFC 4791 §4.1 requires of a calendar object resource:
 *
 * - one `VCALENDAR`, `VERSION:2.0`, no `METHOD`;
 * - components of a single type, all with the same `UID` — `VEVENT` is
 *   the only type v1 stores, so a lone `VTODO`/`VJOURNAL`/`VFREEBUSY` is
 *   rejected as an unsupported component, and a mix of types as an
 *   invalid resource;
 * - at most one master (no `RECURRENCE-ID`) and no two overrides for the
 *   same `RECURRENCE-ID`; *no* master is fine (an object of overrides
 *   only, RFC 4791 §4.1);
 * - every `TZID` defined by a `VTIMEZONE` in the object or a known IANA
 *   zone (a bare unknown name would silently misplace the event, so it
 *   is an error, not a guess) — see {@link ZoneRegistry};
 * - times that exist, `DTEND` not before `DTSTART`, and a recurrence rule
 *   the library can evaluate.
 *
 * Overrides carry no recurrence of their own: `RRULE`/`RDATE`/`EXDATE` on
 * a `RECURRENCE-ID` component are ignored, as is `RANGE=THISANDFUTURE`
 * (each override affects its own instance only).
 *
 * A thin wrapper by design: everything the rest of the server touches is
 * the plain data in {@link ParsedCalendarObject}, so the parsing library
 * (ical.js) can be replaced without touching callers, like `parseVCard`.
 *
 * @throws {@link CalendarParseError} Carrying the violated precondition.
 */
export function parseCalendarObject(text: string): ParsedCalendarObject {
  let root: ICAL.Component;
  try {
    const jcal = ICAL.parse(stripByteOrderMark(text)) as unknown;
    if (Array.isArray(jcal) && Array.isArray(jcal[0])) {
      throw invalidData('The data contains more than one VCALENDAR.');
    }
    root = new ICAL.Component(
      jcal as ConstructorParameters<typeof ICAL.Component>[0],
    );
  } catch (error) {
    if (error instanceof CalendarParseError) {
      throw error;
    }
    throw invalidData(
      `Not valid iCalendar data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (root.name !== 'vcalendar') {
    throw invalidData('The data is not a VCALENDAR.');
  }
  if (root.getFirstPropertyValue('version') !== '2.0') {
    throw invalidData('The VCALENDAR must declare VERSION:2.0.');
  }
  if (root.hasProperty('method')) {
    throw invalidResource(
      'A calendar object resource must not specify the iCalendar METHOD property.',
    );
  }

  try {
    const timezones: ParsedTimezone[] = [];
    for (const vtimezone of root.getAllSubcomponents('vtimezone')) {
      const tzid = vtimezone.getFirstPropertyValue('tzid');
      if (typeof tzid !== 'string' || tzid === '') {
        throw invalidData('A VTIMEZONE without TZID is not valid.');
      }
      if (
        vtimezone.getAllSubcomponents('standard').length +
          vtimezone.getAllSubcomponents('daylight').length ===
        0
      ) {
        throw invalidData(
          `The VTIMEZONE "${tzid}" defines no STANDARD or DAYLIGHT rules.`,
        );
      }
      if (timezones.some((existing) => existing.tzid === tzid)) {
        throw invalidResource(
          `The VTIMEZONE "${tzid}" is defined more than once.`,
        );
      }
      timezones.push({ tzid, vtimezone: vtimezone.toString() });
    }

    const components = root
      .getAllSubcomponents()
      .filter((component) => component.name !== 'vtimezone');
    if (components.length === 0) {
      throw invalidResource(
        'The calendar object contains no calendar component.',
      );
    }
    const types = new Set(components.map((component) => component.name));
    if (types.size > 1) {
      throw invalidResource(
        `A calendar object resource must not contain more than one type of calendar component (found ${[...types].map((t) => t.toUpperCase()).join(', ')}).`,
      );
    }
    const [type] = types;
    if (type !== 'vevent') {
      throw new CalendarParseError(
        `${type.toUpperCase()} is not supported; only VEVENT calendar components can be stored.`,
        'supported-calendar-component',
      );
    }

    const uids = new Set(
      components.map((component) => {
        const uid = component.getFirstPropertyValue('uid');
        return typeof uid === 'string' ? uid : '';
      }),
    );
    if (uids.has('')) {
      throw invalidResource('Every VEVENT needs a UID.');
    }
    if (uids.size > 1) {
      throw invalidResource(
        'All components of a calendar object resource must have the same UID.',
      );
    }
    const [uid] = uids;

    let master: ParsedComponent | null = null;
    const overrides: ParsedComponent[] = [];
    const seenRecurrenceIds = new Set<string>();
    for (const component of components) {
      const parsed = extractComponent(component);
      if (parsed.recurrenceId === null) {
        if (master) {
          throw invalidResource(
            'A calendar object resource can hold only one master component (one without RECURRENCE-ID).',
          );
        }
        master = parsed;
      } else {
        const key = timeKey(parsed.recurrenceId);
        if (seenRecurrenceIds.has(key)) {
          throw invalidResource('Two components have the same RECURRENCE-ID.');
        }
        seenRecurrenceIds.add(key);
        overrides.push(parsed);
      }
    }

    const result: ParsedCalendarObject = {
      uid,
      componentType: 'VEVENT',
      master,
      overrides,
      timezones,
    };
    validateTimes(result);
    return result;
  } catch (error) {
    if (error instanceof CalendarParseError) {
      throw error;
    }
    throw invalidData(
      `Not valid iCalendar data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
