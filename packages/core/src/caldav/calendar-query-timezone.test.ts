import { describe, expect, it } from 'vitest';
import type { CalendarCollection } from '../entities/calendar-collection.entity.js';
import { CalendarParseError } from './icalendar-parser.js';
import { resolveReportFloatingTimeZone } from './calendar-query-timezone.js';

const BERLIN_VTIMEZONE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//x//EN',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:STANDARD',
  'DTSTART:19701025T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'END:STANDARD',
  'END:VTIMEZONE',
  'END:VCALENDAR',
].join('\r\n');

function calendar(
  timezone: string | null,
): Pick<CalendarCollection, 'timezone'> {
  return { timezone };
}

describe('resolveReportFloatingTimeZone', () => {
  it("prefers the request's own <C:timezone> over the calendar's", () => {
    expect(
      resolveReportFloatingTimeZone(
        BERLIN_VTIMEZONE,
        calendar('America/New_York'),
      ),
    ).toBe('Europe/Berlin');
  });

  it("falls back to the calendar's calendar-timezone when the request has none", () => {
    expect(
      resolveReportFloatingTimeZone(null, calendar(BERLIN_VTIMEZONE)),
    ).toBe('Europe/Berlin');
    expect(resolveReportFloatingTimeZone('', calendar(BERLIN_VTIMEZONE))).toBe(
      'Europe/Berlin',
    );
  });

  it('falls back to UTC (null) when neither is set', () => {
    expect(resolveReportFloatingTimeZone(null, calendar(null))).toBeNull();
  });

  it('rejects an invalid request timezone with a CalendarParseError', () => {
    expect(() =>
      resolveReportFloatingTimeZone('not a VTIMEZONE', calendar(null)),
    ).toThrow(CalendarParseError);
  });

  it("falls back to UTC when the calendar's own stored calendar-timezone doesn't parse, rather than failing the report", () => {
    expect(resolveReportFloatingTimeZone(null, calendar('garbage'))).toBeNull();
  });
});
