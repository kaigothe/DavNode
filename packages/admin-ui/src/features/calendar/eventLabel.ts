import type { Dayjs } from 'dayjs';
import type { TFunction } from 'i18next';
import type { ViewEvent } from '../../lib/calendarLayout';
import { dayKey, formatTimeRange } from '../../lib/events';

/**
 * What a screen reader says for an event button. The name has to contain what
 * the button shows, in the same order (a visible label must be part of the
 * accessible name): title, time, place — and then the calendar. A month cell
 * shows the start time before the title, so there it comes first.
 */
export function eventLabel(
  event: ViewEvent,
  day: Dayjs | undefined,
  locale: string,
  t: TFunction,
  options: { timeFirst?: boolean } = {},
): string {
  const title = event.summary ?? t('content.untitled');
  const range = event.isAllDay
    ? ''
    : formatTimeRange(event, locale, day ? dayKey(day) : undefined);
  const when = range || t('content.allDay');
  const base = event.location
    ? t('calendar.eventLabelWithPlace', {
        title,
        when,
        place: event.location,
        calendar: event.calendarName,
      })
    : t('calendar.eventLabel', { title, when, calendar: event.calendarName });
  const start = range.split(' – ')[0];
  return options.timeFirst && start ? `${start}, ${base}` : base;
}
