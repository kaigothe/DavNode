import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { CalendarEvent } from '../api/client';

dayjs.extend(utc);

/** The most days one event is spread over in the month view. */
const MAX_SPAN_DAYS = 62;

/** `2026-10-26` — the key the month view groups events by. */
export const dayKey = (day: Dayjs): string => day.format('YYYY-MM-DD');

/**
 * An event as days on the calendar. An all-day event is a date, not an
 * instant: it is read in UTC (the server stores its date as midnight UTC)
 * so it stays on its day in every time zone; a timed event is shown in the
 * browser's zone. `end` is exclusive.
 */
function span(event: CalendarEvent): { start: Dayjs; end: Dayjs } {
  const read = event.isAllDay ? dayjs.utc : dayjs;
  return { start: read(event.start), end: read(event.end) };
}

/** Every day `event` touches, as {@link dayKey}s, in order. */
export function eventDayKeys(event: CalendarEvent): string[] {
  const { start, end } = span(event);
  const last = end.isAfter(start) ? end.subtract(1, 'millisecond') : start;
  const keys: string[] = [];
  let day = start.startOf('day');
  while (!day.isAfter(last) && keys.length < MAX_SPAN_DAYS) {
    keys.push(dayKey(day));
    day = day.add(1, 'day');
  }
  return keys;
}

/** Groups events by the days they touch. */
export function groupByDay(
  events: readonly CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const days = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    for (const key of eventDayKeys(event)) {
      const list = days.get(key) ?? [];
      list.push(event);
      days.set(key, list);
    }
  }
  return days;
}

/** The time of day, `09:00`, in the user's locale; empty for an all-day event. */
export function formatTimeRange(
  event: CalendarEvent,
  locale: string,
  day?: string,
): string {
  if (event.isAllDay) {
    return '';
  }
  const { start, end } = span(event);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  // On a later day of a multi-day event the start is not today's.
  const startsToday = day === undefined || dayKey(start) === day;
  const endsToday = day === undefined || dayKey(end) === day;
  if (!startsToday && !endsToday) {
    // The event covers this whole day.
    return '';
  }
  const from = startsToday ? time.format(start.toDate()) : '…';
  const to = endsToday ? time.format(end.toDate()) : '…';
  return from === to ? from : `${from} – ${to}`;
}

/** The whole period of an event for a heading: a date or date range, plus the times. */
export function formatWhen(event: CalendarEvent, locale: string): string {
  const { start, end } = span(event);
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(event.isAllDay ? { timeZone: 'UTC' } : {}),
  });
  const clock = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const lastDay = end.isAfter(start) ? end.subtract(1, 'millisecond') : start;
  const first = date.format(start.toDate());
  const last = date.format(lastDay.toDate());
  if (event.isAllDay) {
    return first === last ? first : `${first} – ${last}`;
  }
  return first === last
    ? `${first}, ${formatTimeRange(event, locale)}`
    : `${first} ${clock.format(start.toDate())} – ${last} ${clock.format(end.toDate())}`;
}
