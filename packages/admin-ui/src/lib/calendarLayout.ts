import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { CalendarEvent } from '../api/client';

dayjs.extend(utc);

/** The three ways to look at a calendar. */
export type CalendarView = 'day' | 'week' | 'month';

/** An event together with the calendar it came from, as the views need it. */
export interface ViewEvent extends CalendarEvent {
  /** Unique among the events of the view (an instance of a recurring event repeats `objectId`). */
  key: string;
  calendarId: string;
  calendarName: string;
  /** `#rrggbb`. */
  color: string;
}

/** The shortest an event is drawn in the time grid, so a 5-minute event can still be read and clicked. */
export const MIN_BLOCK_MINUTES = 20;

const MINUTES_PER_DAY = 24 * 60;

/**
 * The days a view shows. A week starts on the locale's first day of the
 * week; a month is padded with the days of the weeks it touches, in as many
 * rows as it needs.
 */
export function visibleDays(view: CalendarView, date: Dayjs): Dayjs[] {
  // A date made before the language changed still carries the old locale (and
  // so the old first day of the week): bind it to the current one.
  const day = date.locale(dayjs.locale()).startOf('day');
  let first: Dayjs;
  let count: number;
  if (view === 'day') {
    first = day;
    count = 1;
  } else if (view === 'week') {
    first = day.startOf('week');
    count = 7;
  } else {
    first = day.startOf('month').startOf('week');
    const last = day.endOf('month').startOf('day');
    count = Math.ceil((daysBetween(first, last) + 1) / 7) * 7;
  }
  return Array.from({ length: count }, (_, i) => first.add(i, 'day'));
}

/** Whole calendar days from `a` to `b` (negative when `b` is earlier), immune to a day with 23 or 25 hours. */
export function daysBetween(a: Dayjs, b: Dayjs): number {
  return Math.round(
    (b.startOf('day').valueOf() - a.startOf('day').valueOf()) / 86_400_000,
  );
}

/**
 * When an event happens, in the browser's zone with `end` exclusive. An
 * all-day event is a date, not an instant: the server hands it over as
 * midnight UTC and it must stay on its date in every zone, so its dates are
 * moved to local midnights.
 */
export function localSpan(event: CalendarEvent): { start: Dayjs; end: Dayjs } {
  if (event.isAllDay) {
    const toLocal = (value: string) => {
      const d = dayjs.utc(value);
      return dayjs(new Date(d.year(), d.month(), d.date()));
    };
    const start = toLocal(event.start);
    const end = toLocal(event.end);
    return { start, end: end.isAfter(start) ? end : start.add(1, 'day') };
  }
  return { start: dayjs(event.start), end: dayjs(event.end) };
}

/** The last millisecond an event covers (equal to its start for an event without length). */
function lastInstant({ start, end }: { start: Dayjs; end: Dayjs }): Dayjs {
  return end.isAfter(start) ? end.subtract(1, 'millisecond') : start;
}

/** Whether the event is drawn as a bar across days: an all-day event, or one that crosses midnight. */
export function isSpanning(event: CalendarEvent): boolean {
  if (event.isAllDay) {
    return true;
  }
  const span = localSpan(event);
  return !lastInstant(span).startOf('day').isSame(span.start.startOf('day'));
}

/** Every event that touches `day`, all-day ones first, then by start time. */
export function eventsOnDay<T extends CalendarEvent>(
  events: readonly T[],
  day: Dayjs,
): T[] {
  const dayStart = day.startOf('day');
  const dayEnd = dayStart.add(1, 'day');
  return events
    .filter((event) => {
      const span = localSpan(event);
      return (
        span.start.isBefore(dayEnd) && !lastInstant(span).isBefore(dayStart)
      );
    })
    .sort(
      (a, b) =>
        Number(b.isAllDay) - Number(a.isAllDay) ||
        localSpan(a).start.valueOf() - localSpan(b).start.valueOf(),
    );
}

/** One event in the time grid of one day. All numbers are minutes from midnight, except the columns. */
export interface TimeBlock<T extends CalendarEvent = ViewEvent> {
  event: T;
  top: number;
  height: number;
  /** Which of `columns` side-by-side columns it sits in. */
  column: number;
  /** How many events overlap here, so how many columns the space is shared in. */
  columns: number;
  /** The event started on an earlier day. */
  before: boolean;
  /** The event goes on after this day. */
  after: boolean;
}

/**
 * Places the timed events of `day` in the time grid: each at its time, cut at
 * the edges of the day, and events that overlap side by side in columns.
 * All-day events are not part of the grid.
 */
export function layoutTimeColumn<T extends CalendarEvent>(
  events: readonly T[],
  day: Dayjs,
): TimeBlock<T>[] {
  const dayStart = day.startOf('day');
  const dayEnd = dayStart.add(1, 'day');
  const items = events
    .filter((event) => !event.isAllDay)
    .flatMap((event) => {
      const span = localSpan(event);
      if (
        !span.start.isBefore(dayEnd) ||
        lastInstant(span).isBefore(dayStart)
      ) {
        return [];
      }
      const startMs = Math.max(span.start.valueOf(), dayStart.valueOf());
      const endMs = Math.min(span.end.valueOf(), dayEnd.valueOf());
      const top = Math.round((startMs - dayStart.valueOf()) / 60_000);
      const length = Math.max(
        MIN_BLOCK_MINUTES,
        Math.round((endMs - startMs) / 60_000),
      );
      const height = Math.min(length, MINUTES_PER_DAY - top);
      return [
        {
          event,
          top,
          height,
          before: span.start.isBefore(dayStart),
          after: span.end.isAfter(dayEnd),
        },
      ];
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);

  const placed: TimeBlock<T>[] = [];
  let cluster: TimeBlock<T>[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];
  const closeCluster = () => {
    for (const block of cluster) {
      block.columns = columnEnds.length;
    }
    placed.push(...cluster);
    cluster = [];
    columnEnds = [];
  };
  for (const item of items) {
    if (item.top >= clusterEnd && cluster.length > 0) {
      closeCluster();
    }
    let column = columnEnds.findIndex((end) => end <= item.top);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(0);
    }
    columnEnds[column] = item.top + item.height;
    clusterEnd = Math.max(clusterEnd, item.top + item.height);
    cluster.push({ ...item, column, columns: 1 });
  }
  closeCluster();
  return placed;
}

/** One event drawn as a bar across the days of a row. */
export interface Bar<T extends CalendarEvent = ViewEvent> {
  event: T;
  /** First and last column (day) of the row it covers, inclusive. */
  startColumn: number;
  endColumn: number;
  /** Which line of bars it sits on, from 0. */
  lane: number;
  /** It started before the first day of the row. */
  before: boolean;
  /** It goes on after the last day of the row. */
  after: boolean;
}

/**
 * Lays the events that span days (all-day ones; with `includeMultiDay` also
 * timed ones that cross midnight) as bars over a row of consecutive `days`,
 * on as few lines as possible.
 */
export function layoutBars<T extends CalendarEvent>(
  events: readonly T[],
  days: readonly Dayjs[],
  includeMultiDay = false,
): { bars: Bar<T>[]; lanes: number } {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) {
    return { bars: [], lanes: 0 };
  }
  const rowStart = first.startOf('day');
  const rowEnd = last.startOf('day').add(1, 'day');
  const candidates = events
    .filter((event) => event.isAllDay || (includeMultiDay && isSpanning(event)))
    .flatMap((event) => {
      const span = localSpan(event);
      if (
        !span.start.isBefore(rowEnd) ||
        lastInstant(span).isBefore(rowStart)
      ) {
        return [];
      }
      return [
        {
          event,
          startColumn: Math.max(0, daysBetween(rowStart, span.start)),
          endColumn: Math.min(
            days.length - 1,
            daysBetween(rowStart, lastInstant(span)),
          ),
          before: span.start.isBefore(rowStart),
          after: span.end.isAfter(rowEnd),
        },
      ];
    })
    .sort(
      (a, b) =>
        a.startColumn - b.startColumn ||
        b.endColumn - b.startColumn - (a.endColumn - a.startColumn),
    );
  const laneEnds: number[] = [];
  const bars = candidates.map((candidate) => {
    let lane = laneEnds.findIndex((end) => end < candidate.startColumn);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(-1);
    }
    laneEnds[lane] = candidate.endColumn;
    return { ...candidate, lane };
  });
  return { bars, lanes: laneEnds.length };
}

/**
 * The events of each day of a row that are not drawn as bars (timed ones that
 * stay within a day), in time order — what a month cell lists.
 */
export function singleDayEvents<T extends CalendarEvent>(
  events: readonly T[],
  days: readonly Dayjs[],
): T[][] {
  return days.map((day) =>
    eventsOnDay(events, day).filter((event) => !isSpanning(event)),
  );
}
