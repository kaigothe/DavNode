import {
  addWallDays,
  durationMillis,
  toInstantMs,
  type TimeResolution,
} from './calendar-time.js';
import { ZoneRegistry } from './calendar-zones.js';
import type { ParsedCalendarObject, ParsedTask } from './icalendar-parser.js';

/**
 * Whether a `VTODO` or `VJOURNAL` overlaps `[start, end)` (RFC 4791 §9.9's
 * tables). Either bound may be `null` (open). Only the master is
 * evaluated; recurring tasks are not expanded.
 *
 * `VTODO`: `DTSTART`+`DURATION`/`DUE` is the interval; `DTSTART` alone
 * matches from its instant on (`start <= DTSTART < end`); `DUE` alone
 * when `start < DUE <= end`; `COMPLETED`/`CREATED` by either instant;
 * `CREATED` alone when `end > CREATED`; nothing at all always matches. `VJOURNAL`: `DTSTART` inside the range (a `DATE` takes
 * the whole day), nothing without `DTSTART`.
 *
 * @param parsed - A parsed `VTODO`/`VJOURNAL` object.
 * @param start - Range start (inclusive) in epoch ms, or `null`.
 * @param end - Range end (exclusive) in epoch ms, or `null`.
 * @param floatingTimeZone - Zone for floating times and dates, or `null` (UTC).
 */
export function taskMatchesTimeRange(
  parsed: ParsedCalendarObject,
  start: number | null,
  end: number | null,
  floatingTimeZone: string | null,
): boolean {
  const task = parsed.task;
  if (!task) {
    return false;
  }
  const resolution: TimeResolution = {
    zones: new ZoneRegistry(parsed.timezones),
    floatingTimeZone,
  };
  const at = (time: NonNullable<ParsedTask['dtstart']>): number =>
    toInstantMs(time, resolution);
  const lo = start ?? Number.NEGATIVE_INFINITY;
  const hi = end ?? Number.POSITIVE_INFINITY;

  if (parsed.componentType === 'VJOURNAL') {
    if (!task.dtstart) {
      return false;
    }
    const from = at(task.dtstart);
    const to =
      task.dtstart.kind === 'date'
        ? at(addWallDays(task.dtstart, 1))
        : from + 1;
    return from < hi && to > lo;
  }

  const { dtstart, due, duration, completed, created } = task;
  if (dtstart && (due || duration !== null)) {
    const from = at(dtstart);
    const to = due ? at(due) : from + durationMillis(duration ?? 'PT0S');
    return to > from ? from < hi && to > lo : from >= lo && from < hi;
  }
  if (dtstart) {
    return lo <= at(dtstart) && hi > at(dtstart);
  }
  if (due) {
    const when = at(due);
    return lo < when && hi >= when;
  }
  if (completed) {
    const when = at(completed);
    const createdWhen = created ? at(created) : null;
    return (
      (lo <= when || (createdWhen !== null && lo <= createdWhen)) &&
      (hi >= when || (createdWhen !== null && hi >= createdWhen))
    );
  }
  if (created) {
    return hi > at(created);
  }
  return true;
}
