import ICAL from 'ical.js';
import {
  utcMillis,
  type WallClock,
  type ZoneRegistry,
} from './calendar-zones.js';
import type { CalendarTime, ParsedComponent } from './icalendar-parser.js';

/**
 * What it takes to turn a {@link CalendarTime} into an instant: the
 * zones the object defines or can resolve, and how to read *floating*
 * times and `DATE` values, which name no zone.
 */
export interface TimeResolution {
  /** Resolves `TZID`s. */
  zones: ZoneRegistry;
  /**
   * The zone floating times and dates are read in — an IANA `TZID` or one
   * the object defines. `null` reads them as UTC. RFC 4791 §7.3 makes
   * this a per-query choice (the request's `CALDAV:timezone`, else the
   * calendar's `calendar-timezone`, else the server's), which is why it
   * is a parameter and not fixed at indexing time.
   */
  floatingTimeZone: string | null;
}

const DAY_MS = 86_400_000;

/** The fields of `time` as a {@link WallClock}. */
export function wallClockOf(time: CalendarTime): WallClock {
  return {
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
  };
}

/**
 * The instant `time` denotes, in milliseconds since the epoch: UTC times
 * as written, zoned times through their zone's offset at that wall-clock
 * time, floating times and dates in {@link TimeResolution.floatingTimeZone}
 * (UTC if none).
 *
 * @throws {@link UnknownTimezoneError} If a needed zone can't be resolved.
 */
export function toInstantMs(
  time: CalendarTime,
  resolution: TimeResolution,
): number {
  const clock = wallClockOf(time);
  const wall = utcMillis(clock);
  if (time.kind === 'utc') {
    return wall;
  }
  const tzid = time.kind === 'zoned' ? time.tzid : resolution.floatingTimeZone;
  if (tzid === null) {
    return wall;
  }
  return wall - resolution.zones.offsetSeconds(tzid, clock) * 1000;
}

/** `time` moved by whole calendar days, keeping its kind and zone. */
export function addWallDays(time: CalendarTime, days: number): CalendarTime {
  const moved = new Date(utcMillis(wallClockOf(time)) + days * DAY_MS);
  return {
    ...time,
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

/** An `ICAL.Time` for `time`, its zone attached — what the recurrence iterator needs. */
export function toIcalTime(
  time: CalendarTime,
  resolution: TimeResolution,
): ICAL.Time {
  let zone: ICAL.Timezone;
  if (time.kind === 'utc') {
    zone = ICAL.Timezone.utcTimezone;
  } else if (time.kind === 'zoned') {
    zone = resolution.zones.get(time.tzid ?? '');
  } else if (resolution.floatingTimeZone !== null) {
    zone = resolution.zones.get(resolution.floatingTimeZone);
  } else {
    zone = ICAL.Timezone.localTimezone;
  }
  return ICAL.Time.fromData(
    { ...wallClockOf(time), isDate: time.kind === 'date' },
    zone,
  );
}

/** The length of an iCalendar `DURATION` in milliseconds (a day counts as 24 hours, a week as seven days). */
export function durationMillis(duration: string): number {
  return ICAL.Duration.fromString(duration).toSeconds() * 1000;
}

/** When `component` starts, as an instant. */
export function startMs(
  component: ParsedComponent,
  resolution: TimeResolution,
): number {
  return toInstantMs(component.dtstart, resolution);
}

/**
 * When `component` ends, as an instant — its effective `DTEND` (RFC 4791
 * §9.9): the `DTEND`, else `DTSTART` + `DURATION`, else one day after a
 * `DATE` start and the start itself for a `DATE-TIME` start.
 */
export function endMs(
  component: ParsedComponent,
  resolution: TimeResolution,
): number {
  if (component.dtend) {
    return toInstantMs(component.dtend, resolution);
  }
  const start = startMs(component, resolution);
  if (component.duration !== null) {
    return start + durationMillis(component.duration);
  }
  if (component.dtstart.kind === 'date') {
    return toInstantMs(addWallDays(component.dtstart, 1), resolution);
  }
  return start;
}
