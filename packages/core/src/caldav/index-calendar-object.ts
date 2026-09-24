import type { EntityManager } from 'typeorm';
import { CalendarObject } from '../entities/calendar-object.entity.js';
import type {
  CalendarStatus,
  CalendarTransparency,
} from '../entities/calendar-object.entity.js';
import {
  endMs,
  startMs,
  toInstantMs,
  type TimeResolution,
} from './calendar-time.js';
import { ZoneRegistry } from './calendar-zones.js';
import {
  computeRecurrenceSpanEnd,
  type RecurrenceOptions,
} from './expand-recurrence.js';
import type {
  ParsedCalendarObject,
  ParsedComponent,
} from './icalendar-parser.js';

/** The values `indexCalendarObject` writes into `CalendarObject`'s time-range index columns. */
export interface TimeRangeIndex {
  /** The earliest start of any occurrence. */
  dtstart: Date;
  /** The effective end (RFC 4791 §9.9) of the master, or of the earliest override for an object without master. */
  dtend: Date;
  /** The (master) event is an all-day (`DATE`) one. */
  isAllDay: boolean;
  /** The end of the last occurrence; `null` if the object recurs without end. */
  recurrenceSpanEnd: Date | null;
  /** The (master) event's `TRANSP`. */
  transparency: CalendarTransparency;
  /** The (master) event's `STATUS`. */
  status: CalendarStatus | null;
}

/**
 * The range of UTC offsets a *floating* time or `DATE` can end up with
 * when a query resolves it in a zone of its choice (RFC 4791 §7.3), in
 * milliseconds east of UTC. The index stores such values read as UTC (see
 * {@link computeTimeRangeIndex}); the instant a query actually means is
 * `stored - offset`, so it can lie up to `latest` before and `-earliest`
 * after the stored value. A prefilter that must not miss such an object
 * therefore compares `dtstart` against `rangeEnd + latest` and
 * `recurrence_span_end` against `rangeStart + earliest`.
 */
export const FLOATING_TIME_OFFSET_BOUNDS_MS = {
  /** UTC−12:00, the westernmost zone in use. */
  earliest: -12 * 3_600_000,
  /** UTC+14:00, the easternmost zone in use. */
  latest: 14 * 3_600_000,
} as const;

/**
 * Derives the time-range index columns from a parsed object — pure, so
 * it can be tested and reused without a database.
 *
 * The index is a *prefilter* for `calendar-query`: it may return objects
 * that don't match (the exact test, `expandOccurrences`, weeds those
 * out) but must never hide one that does. Where the plan's
 * "`DTSTART` of the master" would leave a gap, it is therefore widened:
 *
 * - `dtstart` is the earliest start among the master, the overrides and
 *   the `RDATE`s — an override or `RDATE` before the master's `DTSTART`
 *   is legal and would otherwise fall outside `dtstart < rangeEnd`;
 * - `recurrenceSpanEnd` is {@link computeRecurrenceSpanEnd}: the latest
 *   end of any occurrence, `null` for a series without end;
 * - `dtend` is always the *effective* end — `DTEND`, else `DTSTART` +
 *   `DURATION`, else a day after a `DATE` start and the start itself for
 *   a `DATE-TIME` start (RFC 4791 §9.9) — so no consumer has to
 *   re-derive it, and `null` never occurs;
 * - an object without master (overrides only) is indexed from its
 *   overrides.
 *
 * **Floating times and dates** name no zone; RFC 4791 §7.3 lets each
 * query pick one (its `CALDAV:timezone`, else the calendar's, else the
 * server's), so no single instant can be stored. They are stored as if
 * they were UTC, and a query prefilter has to widen its range by
 * {@link FLOATING_TIME_OFFSET_BOUNDS_MS} to stay sound; the exact
 * check then resolves them in the query's zone. Zoned (`TZID`) and UTC
 * times are exact.
 *
 * The prefilter this index supports, for a range `[start, end)` in epoch
 * milliseconds, keeps the objects where `dtstart < end` holds and
 * `recurrence_span_end` is null or `>= start`. It is `>=`, not `>`,
 * because a point event (no `DTEND`, zero length) at exactly `start`
 * matches (RFC 4791 §9.9) and its span end equals its start. The tests
 * check this query against the exact expansion over a corpus of object
 * shapes.
 *
 * @param parsed - The object.
 * @param options - Only for tests and callers that want a different
 * floating-time reading; the stored index always uses UTC.
 */
export function computeTimeRangeIndex(
  parsed: ParsedCalendarObject,
  options: RecurrenceOptions = {},
): TimeRangeIndex {
  const resolution: TimeResolution = {
    zones: new ZoneRegistry(parsed.timezones),
    floatingTimeZone: options.floatingTimeZone ?? null,
  };

  const components: ParsedComponent[] = [
    ...(parsed.master ? [parsed.master] : []),
    ...parsed.overrides,
  ];
  let earliest = components[0];
  let earliestStart = startMs(earliest, resolution);
  for (const component of components) {
    const start = startMs(component, resolution);
    if (start < earliestStart) {
      earliest = component;
      earliestStart = start;
    }
  }
  const reference = parsed.master ?? earliest;

  let dtstart = earliestStart;
  for (const rdate of parsed.master?.rdate ?? []) {
    dtstart = Math.min(dtstart, toInstantMs(rdate.start, resolution));
  }

  return {
    dtstart: new Date(dtstart),
    dtend: new Date(endMs(reference, resolution)),
    isAllDay: reference.isAllDay,
    recurrenceSpanEnd: computeRecurrenceSpanEnd(parsed, options),
    transparency: reference.transparency,
    status: reference.status,
  };
}

/**
 * Writes the time-range index columns of the `CalendarObject`
 * `calendarObjectId` from `parsed` (see {@link computeTimeRangeIndex}).
 * Every column is overwritten, so a PUT that updates an object never
 * leaves values of the previous version behind.
 *
 * Takes the caller's own `EntityManager` rather than opening a
 * transaction — the index and the `CalendarObjectContent` it is derived
 * from must commit or roll back together, like `indexVCard`'s rows and
 * their vCard.
 *
 * @param manager - The manager of the transaction that also writes the
 * object's content.
 * @param calendarObjectId - The object to index.
 * @param parsed - The object's iCalendar content, already parsed.
 * @throws An `Error` if no such `CalendarObject` exists.
 */
export async function indexCalendarObject(
  manager: EntityManager,
  calendarObjectId: string,
  parsed: ParsedCalendarObject,
): Promise<void> {
  const repository = manager.getRepository(CalendarObject);
  const result = await repository.update(
    { id: calendarObjectId },
    computeTimeRangeIndex(parsed),
  );
  // An UPDATE also bumps `updated_at`, so on Postgres, MySQL and SQLite
  // (all checked) `affected` is 1 even when every value is unchanged, and 0
  // means the row is missing. A driver that counts only *changed* rows (MySQL
  // without CLIENT_FOUND_ROWS) could report 0 for an identical re-index, so
  // confirm before calling it an error.
  if (
    !result.affected &&
    !(await repository.existsBy({ id: calendarObjectId }))
  ) {
    throw new Error(`No CalendarObject with id ${calendarObjectId} to index.`);
  }
}
