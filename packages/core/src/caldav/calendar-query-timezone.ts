import { CalendarCollection } from '../entities/calendar-collection.entity.js';
import { parseCalendarTimezone } from './calendar-timezone.js';

/**
 * The floating-time zone a CalDAV REPORT resolves "date" and "date with
 * local time" values in (RFC 4791 §7.3): the request's own
 * `CALDAV:timezone`, else the target calendar's `CALDAV:calendar-timezone`,
 * else UTC (this server's choice, where the RFC leaves it open).
 *
 * Only the `TZID` of whichever `VTIMEZONE` wins is used — `ZoneRegistry`
 * then resolves it the same way it resolves any zone a calendar object
 * itself refers to without carrying its own definition: from the
 * calendar object's own embedded `VTIMEZONE` if it happens to define
 * that same `TZID`, else from the IANA database via `Intl`. A caller
 * that names a genuinely custom zone (non-IANA rules, not embedded in
 * the objects being tested) gets the IANA/embedded reading, not its own
 * rules verbatim — the same scope `ZoneRegistry` already has for every
 * other per-object zone reference; there is no per-request zone-rule
 * override in this architecture.
 *
 * @param requestTimezoneText - The request's `<C:timezone>` text, if
 * any given.
 * @param calendar - The calendar the REPORT targets.
 * @returns The `TZID` to use as `floatingTimeZone`, or `null` for UTC.
 * @throws {@link CalendarParseError} If `requestTimezoneText` is given
 * but isn't a valid iCalendar object with exactly one `VTIMEZONE` (RFC
 * 4791's `valid-calendar-data` precondition).
 */
export function resolveReportFloatingTimeZone(
  requestTimezoneText: string | null,
  calendar: Pick<CalendarCollection, 'timezone'>,
): string | null {
  if (requestTimezoneText !== null && requestTimezoneText.trim() !== '') {
    return parseCalendarTimezone(requestTimezoneText).tzid;
  }
  if (calendar.timezone !== null) {
    try {
      return parseCalendarTimezone(calendar.timezone).tzid;
    } catch {
      // The calendar's own stored calendar-timezone somehow doesn't
      // parse (it is validated at PROPPATCH time once that exists, but
      // that route isn't built yet — see the M6 GA3 gap notes): fall
      // back to UTC rather than fail every REPORT against this calendar.
      return null;
    }
  }
  return null;
}
