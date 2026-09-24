import ICAL from 'ical.js';
import type {
  CalendarStatus,
  CalendarTransparency,
} from '../entities/calendar-object.entity.js';
import {
  durationMillis,
  endMs,
  startMs,
  toIcalTime,
  toInstantMs,
  type TimeResolution,
} from './calendar-time.js';
import { ZoneRegistry } from './calendar-zones.js';
import type {
  CalendarTime,
  ParsedCalendarObject,
  ParsedComponent,
} from './icalendar-parser.js';

/**
 * One actual occurrence of a calendar object: an instance of its
 * recurrence set, or an override standing in for one.
 */
export interface Occurrence {
  /** When the occurrence starts. */
  start: Date;
  /** When it ends (its effective `DTEND`, RFC 4791 §9.9). */
  end: Date;
  /** The occurrence is an all-day (`DATE`) one. */
  isAllDay: boolean;
  /** It comes from a `RECURRENCE-ID` component rather than from the master's rule. */
  isOverride: boolean;
  /** The occurrence's own `TRANSP` — an override can differ from its master. */
  transparency: CalendarTransparency;
  /** The occurrence's own `STATUS` — an override can be cancelled on its own. */
  status: CalendarStatus | null;
}

/** Options shared by {@link expandOccurrences} and {@link computeRecurrenceSpanEnd}. */
export interface RecurrenceOptions {
  /**
   * The zone floating times and `DATE`s are read in (RFC 4791 §7.3: the
   * request's timezone, else the calendar's, else the server's choice).
   * `null`/absent reads them as UTC.
   */
  floatingTimeZone?: string | null;
}

/** Options for {@link expandOccurrences}. */
export interface ExpandOptions extends RecurrenceOptions {
  /** See {@link MAX_RECURRENCE_INSTANCES}. */
  maxInstances?: number;
}

/**
 * The most recurrence-set instances `expandOccurrences` examines for one
 * object by default — counting those before the requested range, since
 * the rule has to be walked from `DTSTART`. A rule like
 * `FREQ=SECONDLY;COUNT=999999999` is cheap to send and would otherwise
 * make every query on the calendar spin. About 55 years of a daily event.
 */
export const MAX_RECURRENCE_INSTANCES = 20_000;

/**
 * How far {@link computeRecurrenceSpanEnd} walks a rule to find its last
 * instance on every write. Beyond it, a rule with `UNTIL` gets that date
 * (plus one instance length) as a safe upper bound and one with only
 * `COUNT` is treated as unbounded.
 */
export const MAX_SPAN_INSTANCES = 10_000;

/**
 * Thrown by {@link expandOccurrences} when an object's recurrence set is
 * too large to walk to the end of the requested range within
 * `maxInstances` — the caller decides what an unanswerable object means.
 */
export class RecurrenceLimitError extends Error {
  /** @param limit - The instance limit that was exceeded. */
  constructor(readonly limit: number) {
    super(`The recurrence set has more than ${limit} instances to examine.`);
    this.name = 'RecurrenceLimitError';
  }
}

const DAY_MS = 86_400_000;

function resolutionFor(
  parsed: ParsedCalendarObject,
  options: RecurrenceOptions,
): TimeResolution {
  return {
    zones: new ZoneRegistry(parsed.timezones),
    floatingTimeZone: options.floatingTimeZone ?? null,
  };
}

/** One instance of the master's recurrence set. */
interface Instance {
  start: number;
  end: number;
  /** Whether the instance has an explicit end (`DTEND` or an `RDATE` period), which makes the range test strict at the start. */
  hasExplicitEnd: boolean;
}

/**
 * Whether `[start, end)` overlaps the range, by the table in RFC 4791
 * §9.9. An event with a positive length overlaps if
 * `rangeStart < end && rangeEnd > start`. One with no `DTEND` and no
 * length — a `DATE-TIME` start alone, or `DURATION` of zero — is a point
 * that counts *at* the range's start (`rangeStart <= start`); an explicit
 * `DTEND` equal to `DTSTART` is still tested strictly, exactly as the
 * RFC's first row has it.
 */
function overlaps(
  start: number,
  end: number,
  hasExplicitEnd: boolean,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  if (end === start && !hasExplicitEnd) {
    return rangeStart <= start && rangeEnd > start;
  }
  return rangeStart < end && rangeEnd > start;
}

/**
 * The master's `RDATE`s as instances, ascending and de-duplicated; a
 * `PERIOD` brings its own end (and, like a `DTEND`, makes the range test
 * strict at the start), any other `RDATE` takes the master's length.
 */
function rdateInstances(
  master: ParsedComponent,
  resolution: TimeResolution,
  length: number,
  hasExplicitEnd: boolean,
): Instance[] {
  const byStart = new Map<number, Instance>();
  for (const rdate of master.rdate) {
    const start = toInstantMs(rdate.start, resolution);
    let end = start + length;
    let explicit = hasExplicitEnd;
    if (rdate.end) {
      end = toInstantMs(rdate.end, resolution);
      explicit = true;
    } else if (rdate.duration !== null) {
      end = start + durationMillis(rdate.duration);
      explicit = true;
    }
    byStart.set(start, { start, end, hasExplicitEnd: explicit });
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start);
}

/**
 * The instances of `master`'s recurrence set in ascending order: the
 * `RRULE`'s instances — or `DTSTART` alone if there is no rule — plus the
 * `RDATE`s, minus the `EXDATE`s. A `DTSTART` that does not fit its own
 * rule (a Thursday for `BYDAY=MO,WE,FR`) is not an instance and does not
 * count towards `COUNT`; ical.js and other implementations of RFC 5545
 * (which leaves this case undefined) agree, so this does too. The rule itself is
 * evaluated by ical.js — only the union and the exclusion happen here.
 * `budget.examined` counts every instance drawn from the rule and is
 * checked against `limit` so a hostile rule cannot run away.
 */
function* recurrenceSet(
  master: ParsedComponent,
  resolution: TimeResolution,
  budget: { examined: number; limit: number },
): Generator<Instance> {
  const dtstart = startMs(master, resolution);
  const length = endMs(master, resolution) - dtstart;
  const hasExplicitEnd = master.dtend !== null;
  const excluded = new Set(
    master.exdate.map((time) => toInstantMs(time, resolution)),
  );

  const rdates = rdateInstances(master, resolution, length, hasExplicitEnd);

  function* ruleInstances(): Generator<Instance> {
    if (master.rrule === null) {
      // No rule: DTSTART is the one instance the RDATEs are added to.
      yield { start: dtstart, end: dtstart + length, hasExplicitEnd };
      return;
    }
    const iterator = new ICAL.RecurIterator({
      rule: ICAL.Recur.fromString(master.rrule),
      dtstart: toIcalTime(master.dtstart, resolution),
      initialized: false,
    });
    for (let next = iterator.next(); next; next = iterator.next()) {
      budget.examined += 1;
      if (budget.examined > budget.limit) {
        throw new RecurrenceLimitError(budget.limit);
      }
      const start = toInstantMs(timeOf(next), resolution);
      yield { start, end: start + length, hasExplicitEnd };
    }
  }

  const rule = ruleInstances();
  let fromRule = rule.next();
  let rdateIndex = 0;
  let last = Number.NEGATIVE_INFINITY;
  while (!fromRule.done || rdateIndex < rdates.length) {
    const takeRule =
      rdateIndex >= rdates.length ||
      (!fromRule.done && fromRule.value.start <= rdates[rdateIndex].start);
    let instance: Instance;
    if (takeRule) {
      instance = fromRule.value as Instance;
      fromRule = rule.next();
    } else {
      instance = rdates[rdateIndex];
      rdateIndex += 1;
    }
    if (instance.start <= last) {
      continue; // the same instant, listed twice
    }
    last = instance.start;
    if (!excluded.has(instance.start)) {
      yield instance;
    }
  }
}

/** The wall-clock fields of an `ICAL.Time` produced by the iterator, as a {@link CalendarTime} in `zone` terms. */
function timeOf(time: ICAL.Time): CalendarTime {
  const zone = time.zone;
  const isUtc = zone === ICAL.Timezone.utcTimezone;
  const isFloating = zone === ICAL.Timezone.localTimezone;
  return {
    kind: time.isDate
      ? 'date'
      : isUtc
        ? 'utc'
        : isFloating
          ? 'floating'
          : 'zoned',
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
    tzid: isUtc || isFloating || time.isDate ? null : zone.tzid,
  };
}

function occurrenceOf(
  component: ParsedComponent,
  start: number,
  end: number,
  isOverride: boolean,
): Occurrence {
  return {
    start: new Date(start),
    end: new Date(end),
    isAllDay: component.isAllDay,
    isOverride,
    transparency: component.transparency,
    status: component.status,
  };
}

/**
 * All actual occurrences of `parsed` that overlap `[rangeStart, rangeEnd)`
 * (RFC 4791 §9.9), in ascending order of start.
 *
 * 1. The master's recurrence set — the `RRULE`'s instances (or `DTSTART`
 *    without a rule) and the `RDATE`s — is generated by ical.js (no home-made rule
 *    interpreter here);
 * 2. instances named by an `EXDATE` are dropped;
 * 3. an instance with a `RECURRENCE-ID` override is replaced by the
 *    override *at the override's own time*, which may be far from the
 *    rule's rhythm (an instance moved two days) — an override overlaps
 *    the range on its own merits, whatever it replaces;
 * 4. an object without `RRULE`/`RDATE` is a single occurrence.
 *
 * Every override is an occurrence, including one that names no instance
 * of the rule (an object holding only overrides has nothing else). Each
 * occurrence carries its own `TRANSP`/`STATUS`, so free/busy can skip a
 * cancelled or transparent override without touching its siblings.
 * `RANGE=THISANDFUTURE` is not applied (see {@link parseCalendarObject}).
 *
 * **Known deviation from RFC 5545 §3.3.10**, inherited from ical.js (and
 * from libical, so Thunderbird shows the same): a `FREQ=YEARLY` rule
 * starting on 29 February puts its non-leap-year instances on 1 March
 * instead of skipping them (an invalid date "MUST be ignored and MUST NOT
 * be counted"). Monthly rules skip short months correctly. The index and
 * the expansion share this one source, so they stay consistent with each
 * other.
 *
 * @param parsed - The object.
 * @param rangeStart - Inclusive start of the range; `null` for open.
 * @param rangeEnd - Exclusive end of the range; `null` for open.
 * @param options - Floating-time zone and instance limit.
 * @throws {@link RecurrenceLimitError} If the rule would have to be walked
 * past `options.maxInstances` ({@link MAX_RECURRENCE_INSTANCES}) to reach
 * the end of the range.
 * @throws {@link UnknownTimezoneError} For an unresolvable zone (cannot
 * happen for an object that `parseCalendarObject` accepted, unless
 * `options.floatingTimeZone` is unknown).
 */
export function expandOccurrences(
  parsed: ParsedCalendarObject,
  rangeStart: Date | null,
  rangeEnd: Date | null,
  options: ExpandOptions = {},
): Occurrence[] {
  const resolution = resolutionFor(parsed, options);
  const from = rangeStart?.getTime() ?? Number.NEGATIVE_INFINITY;
  const to = rangeEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  const results: Occurrence[] = [];

  const overriddenInstants = new Set<number>();
  for (const override of parsed.overrides) {
    if (override.recurrenceId) {
      overriddenInstants.add(toInstantMs(override.recurrenceId, resolution));
    }
    const start = startMs(override, resolution);
    const end = endMs(override, resolution);
    if (overlaps(start, end, override.dtend !== null, from, to)) {
      results.push(occurrenceOf(override, start, end, true));
    }
  }

  const { master } = parsed;
  if (master) {
    const budget = {
      examined: 0,
      limit: options.maxInstances ?? MAX_RECURRENCE_INSTANCES,
    };
    for (const instance of recurrenceSet(master, resolution, budget)) {
      if (instance.start >= to) {
        break;
      }
      if (
        !overriddenInstants.has(instance.start) &&
        overlaps(
          instance.start,
          instance.end,
          instance.hasExplicitEnd,
          from,
          to,
        )
      ) {
        results.push(occurrenceOf(master, instance.start, instance.end, false));
      }
    }
  }

  return results.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** An upper bound for the end of an `UNTIL`-limited rule: `UNTIL`, plus the length of one instance and a day of slack for zone shifts. */
function untilBound(
  recur: ICAL.Recur,
  master: ParsedComponent,
  resolution: TimeResolution,
): number | null {
  const until = recur.until;
  if (!until) {
    return null;
  }
  const untilMs = toInstantMs(timeOf(until), resolution);
  const length = endMs(master, resolution) - startMs(master, resolution);
  return untilMs + length + DAY_MS;
}

/**
 * The end of the object's last occurrence — what the index stores as
 * `recurrence_span_end` so `calendar-query` can skip objects that ended
 * before a range — or `null` if it recurs without end.
 *
 * The span is the latest end of everything the object can produce:
 * - the last instance of the master's rule (found by walking it, up to
 *   {@link MAX_SPAN_INSTANCES}), not `UNTIL` itself — the last instance
 *   *starts* by `UNTIL` and ends later;
 * - every `RDATE` (which may lie beyond the rule's end);
 * - every override (which may have been moved past the last instance).
 * A rule with neither `UNTIL` nor `COUNT` is unbounded: `null`, and so
 * is a `COUNT` rule too long to walk. A too-long rule with `UNTIL` gets
 * `UNTIL` plus one instance length as a safe upper bound instead —
 * the span may be too large but never too small, so the prefilter it
 * feeds can produce false positives but no false negatives.
 *
 * For a non-recurring object this is its `DTEND` (the effective one).
 *
 * @param parsed - The object.
 * @param options - The floating-time zone (UTC by default; the index
 * stores the UTC reading, see `indexCalendarObject`).
 */
export function computeRecurrenceSpanEnd(
  parsed: ParsedCalendarObject,
  options: RecurrenceOptions = {},
): Date | null {
  const resolution = resolutionFor(parsed, options);
  let latest = Number.NEGATIVE_INFINITY;
  for (const override of parsed.overrides) {
    latest = Math.max(latest, endMs(override, resolution));
  }

  const { master } = parsed;
  if (master) {
    // Never below the master's own end, even if an EXDATE removes its first instance.
    latest = Math.max(latest, endMs(master, resolution));
    if (master.rrule !== null) {
      const recur = ICAL.Recur.fromString(master.rrule);
      if (!recur.isFinite()) {
        return null;
      }
      try {
        const budget = { examined: 0, limit: MAX_SPAN_INSTANCES };
        for (const instance of recurrenceSet(master, resolution, budget)) {
          latest = Math.max(latest, instance.end);
        }
      } catch (error) {
        if (!(error instanceof RecurrenceLimitError)) {
          throw error;
        }
        const bound = untilBound(recur, master, resolution);
        if (bound === null) {
          return null;
        }
        latest = Math.max(latest, bound);
        const length = endMs(master, resolution) - startMs(master, resolution);
        for (const rdate of rdateInstances(
          master,
          resolution,
          length,
          master.dtend !== null,
        )) {
          latest = Math.max(latest, rdate.end);
        }
      }
    } else {
      const budget = { examined: 0, limit: MAX_SPAN_INSTANCES };
      for (const instance of recurrenceSet(master, resolution, budget)) {
        latest = Math.max(latest, instance.end);
      }
    }
  }

  return new Date(latest);
}
