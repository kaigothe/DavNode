import ICAL from 'ical.js';

/** A `VTIMEZONE` definition carried by a calendar object, as plain data. */
export interface ParsedTimezone {
  /** The `TZID` the definition is for. */
  tzid: string;
  /** The complete `BEGIN:VTIMEZONE ... END:VTIMEZONE` text. */
  vtimezone: string;
}

/** A wall-clock date and time — fields as written, with no zone attached. */
export interface WallClock {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Thrown by {@link ZoneRegistry.get} for a `TZID` that nothing defines. */
export class UnknownTimezoneError extends Error {
  /** @param tzid - The unresolvable `TZID`. */
  constructor(readonly tzid: string) {
    super(
      `TZID "${tzid}" is neither defined by a VTIMEZONE in the calendar object nor a known IANA time zone.`,
    );
    this.name = 'UnknownTimezoneError';
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A cached `Intl.DateTimeFormat` for an IANA zone, or `undefined` if the runtime doesn't know it. */
function formatterFor(tzid: string): Intl.DateTimeFormat | undefined {
  const cached = formatters.get(tzid);
  if (cached) {
    return cached;
  }
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tzid, formatter);
    return formatter;
  } catch {
    return undefined;
  }
}

/** Milliseconds since the epoch for UTC fields, correct for years below 100 too. */
export function utcMillis(clock: WallClock): number {
  const date = new Date(0);
  date.setUTCFullYear(clock.year, clock.month - 1, clock.day);
  date.setUTCHours(clock.hour, clock.minute, clock.second, 0);
  return date.getTime();
}

/** The offset from UTC (seconds, east positive) `formatter`'s zone has at the UTC instant `utcMs`. */
function offsetAtUtc(formatter: Intl.DateTimeFormat, utcMs: number): number {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatter.formatToParts(new Date(utcMs))) {
    parts[type] = Number(value);
  }
  const wallAsUtc = utcMillis({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  });
  return Math.round((wallAsUtc - Math.floor(utcMs / 1000) * 1000) / 1000);
}

const DAY_MS = 86_400_000;

/** The wall-clock fields of the UTC instant `ms`. */
function wallClockOfMillis(ms: number): WallClock {
  const date = new Date(ms);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

/**
 * The offset (seconds, east positive) a zone defined by a `VTIMEZONE` has
 * at the wall-clock time `clock`, resolved the way RFC 5545 §3.3.5 says
 * and {@link IanaTimezone} does: the *first* occurrence of a repeated
 * time, and, for a skipped time, the offset in force *before* the change.
 *
 * `ICAL.Timezone#utcOffset` gets both wrong (a repeated time reads as the
 * second occurrence, a skipped one with the offset after the change), so
 * it is only trusted where it is unambiguous: the offsets a day before
 * and a day after `clock`. If they agree there is no change near and its
 * answer stands. Otherwise `utcOffset` flips from the earlier to the later
 * offset at one wall-clock time `J` — the start of the skipped time, or
 * of the repeated time — and the skipped or repeated time is exactly
 * `[J, J + |change|)`, which the earlier offset applies to, as does
 * everything before `J`.
 */
function vtimezoneOffset(zone: ICAL.Timezone, clock: WallClock): number {
  const wall = utcMillis(clock);
  const at = (ms: number): number =>
    zone.utcOffset(ICAL.Time.fromData(wallClockOfMillis(ms)));
  const before = at(wall - DAY_MS);
  const after = at(wall + DAY_MS);
  if (before === after) {
    return at(wall);
  }
  // Find the wall-clock second `utcOffset` flips to `after` (`low` still reads `before`).
  let low = wall - DAY_MS;
  let high = wall + DAY_MS;
  while (high - low > 1000) {
    const middle = low + Math.floor((high - low) / 2000) * 1000;
    if (at(middle) === after) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return wall < high + Math.abs(after - before) * 1000 ? before : after;
}

/**
 * An IANA time zone (`Europe/Berlin`), resolved with `Intl` — for a
 * `TZID` a calendar object uses without also carrying a `VTIMEZONE`
 * for it, which clients regularly do and ical.js, having no zone
 * database of its own, would otherwise read as floating time.
 *
 * A wall-clock time that a daylight-saving change makes ambiguous or
 * non-existent is resolved the way RFC 5545 §3.3.5 says: the first
 * occurrence of a repeated time, and, for a skipped time, the offset in
 * force before the change (so 02:30 in a spring-forward gap is 03:30).
 */
class IanaTimezone extends ICAL.Timezone {
  constructor(
    tzid: string,
    private readonly formatter: Intl.DateTimeFormat,
  ) {
    super({ tzid });
  }

  /** Offset in seconds for `clock`, a wall-clock time in this zone. */
  offsetFor(clock: WallClock): number {
    const wall = utcMillis(clock);
    const before = offsetAtUtc(this.formatter, wall - DAY_MS);
    const after = offsetAtUtc(this.formatter, wall + DAY_MS);
    const valid = [...new Set([before, after])].filter(
      (offset) => offsetAtUtc(this.formatter, wall - offset * 1000) === offset,
    );
    return valid.length === 0 ? before : Math.max(...valid);
  }

  /** See `ICAL.Timezone#utcOffset`. */
  override utcOffset(tt: ICAL.Time): number {
    return this.offsetFor(tt);
  }
}

/**
 * The time zones one calendar object can refer to: the `VTIMEZONE`s it
 * carries (which win — a client may define custom rules under a
 * well-known name) and, failing that, IANA zones known to the runtime.
 * Built per operation from plain data (no global registry, so two
 * objects defining the same `TZID` differently can't affect each other).
 */
export class ZoneRegistry {
  private readonly zones = new Map<string, ICAL.Timezone>();

  /** @param definitions - The object's `VTIMEZONE`s. */
  constructor(private readonly definitions: readonly ParsedTimezone[] = []) {}

  /**
   * The zone for `tzid`.
   *
   * @throws {@link UnknownTimezoneError} If it is neither defined nor an
   * IANA zone.
   */
  get(tzid: string): ICAL.Timezone {
    const cached = this.zones.get(tzid);
    if (cached) {
      return cached;
    }
    const definition = this.definitions.find((d) => d.tzid === tzid);
    let zone: ICAL.Timezone;
    if (definition) {
      const jcal = ICAL.parse(definition.vtimezone) as ConstructorParameters<
        typeof ICAL.Component
      >[0];
      zone = new ICAL.Timezone(new ICAL.Component(jcal));
    } else {
      const formatter = formatterFor(tzid);
      if (!formatter) {
        throw new UnknownTimezoneError(tzid);
      }
      zone = new IanaTimezone(tzid, formatter);
    }
    this.zones.set(tzid, zone);
    return zone;
  }

  /** Offset from UTC in seconds (east positive) of `tzid` at the wall-clock time `clock`. */
  offsetSeconds(tzid: string, clock: WallClock): number {
    const zone = this.get(tzid);
    return zone instanceof IanaTimezone
      ? zone.offsetFor(clock)
      : vtimezoneOffset(zone, clock);
  }
}
