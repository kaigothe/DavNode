import { describe, expect, it } from 'vitest';
import { parseCalendarTimezone } from './calendar-timezone.js';
import { CalendarParseError } from './icalendar-parser.js';

/** The `calendar-timezone` value of RFC 4791 §5.2.2's example. */
const US_EASTERN = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Example Corp.//CalDAV Client//EN',
  'VERSION:2.0',
  'BEGIN:VTIMEZONE',
  'TZID:US-Eastern',
  'LAST-MODIFIED:19870101T000000Z',
  'BEGIN:STANDARD',
  'DTSTART:19671029T020000',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:Eastern Standard Time (US & Canada)',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19870405T020000',
  'RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=4',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:Eastern Daylight Time (US & Canada)',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
  'END:VCALENDAR',
  '',
].join('\r\n');

function withVtimezone(inner: string, extra = ''): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//x//EN',
    'BEGIN:VTIMEZONE',
    inner,
    'END:VTIMEZONE',
    extra,
    'END:VCALENDAR',
  ]
    .filter((line) => line !== '')
    .join('\r\n');
}

const STANDARD = [
  'BEGIN:STANDARD',
  'DTSTART:19701025T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'END:STANDARD',
].join('\r\n');

function rejection(text: string): CalendarParseError {
  try {
    parseCalendarTimezone(text);
  } catch (error) {
    expect(error).toBeInstanceOf(CalendarParseError);
    return error as CalendarParseError;
  }
  throw new Error('expected parseCalendarTimezone to throw');
}

describe('parseCalendarTimezone', () => {
  it("accepts RFC 4791's example and returns the zone as plain data", () => {
    const zone = parseCalendarTimezone(US_EASTERN);

    expect(zone.tzid).toBe('US-Eastern');
    expect(zone.vtimezone).toContain('BEGIN:VTIMEZONE');
    expect(zone.vtimezone).toContain('TZID:US-Eastern');
  });

  it('accepts LF line endings and a leading byte order mark', () => {
    expect(
      parseCalendarTimezone(`\uFEFF${US_EASTERN.replace(/\r\n/g, '\n')}`).tzid,
    ).toBe('US-Eastern');
  });

  it('accepts a zone with a single fixed-offset observance', () => {
    expect(
      parseCalendarTimezone(withVtimezone(`TZID:Custom\r\n${STANDARD}`)).tzid,
    ).toBe('Custom');
  });

  it.each([
    ['empty text', ''],
    ['plain text', 'Europe/Berlin'],
    ['a truncated object', 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'],
  ])('rejects %s with valid-calendar-data', (_label, text) => {
    expect(rejection(text).precondition).toBe('valid-calendar-data');
  });

  it('rejects an object that is not a VCALENDAR', () => {
    expect(
      rejection('BEGIN:VEVENT\r\nUID:1\r\nEND:VEVENT\r\n').precondition,
    ).toBe('valid-calendar-data');
  });

  it('rejects a VCALENDAR without VERSION:2.0', () => {
    const text = US_EASTERN.replace('VERSION:2.0', 'VERSION:1.0');

    expect(rejection(text).message).toMatch(/VERSION:2\.0/);
  });

  it('rejects a VCALENDAR without any VTIMEZONE', () => {
    expect(
      rejection(
        'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//x//EN\r\nEND:VCALENDAR',
      ).message,
    ).toMatch(/exactly one VTIMEZONE/);
  });

  it('rejects two VTIMEZONEs', () => {
    const one = withVtimezone(`TZID:A\r\n${STANDARD}`);
    const two = one.replace(
      'END:VCALENDAR',
      [
        'BEGIN:VTIMEZONE',
        'TZID:B',
        STANDARD,
        'END:VTIMEZONE',
        'END:VCALENDAR',
      ].join('\r\n'),
    );

    expect(rejection(two).message).toMatch(/exactly one VTIMEZONE/);
  });

  it('rejects another component next to the VTIMEZONE', () => {
    const text = withVtimezone(
      `TZID:A\r\n${STANDARD}`,
      'BEGIN:VEVENT\r\nUID:1\r\nDTSTAMP:20240101T000000Z\r\nDTSTART:20240101T000000Z\r\nEND:VEVENT',
    );

    expect(rejection(text).message).toMatch(/no other component/);
  });

  it('rejects two VCALENDARs', () => {
    expect(rejection(`${US_EASTERN}${US_EASTERN}`).precondition).toBe(
      'valid-calendar-data',
    );
  });

  it('rejects a VTIMEZONE without TZID', () => {
    expect(rejection(withVtimezone(STANDARD)).message).toMatch(/no TZID/);
  });

  it('rejects a VTIMEZONE without STANDARD or DAYLIGHT', () => {
    expect(rejection(withVtimezone('TZID:A')).message).toMatch(
      /no STANDARD or DAYLIGHT/,
    );
  });

  it.each(['DTSTART', 'TZOFFSETFROM', 'TZOFFSETTO'])(
    'rejects an observance without %s',
    (missing) => {
      const observance = STANDARD.split('\r\n')
        .filter((line) => !line.startsWith(`${missing}:`))
        .join('\r\n');

      expect(
        rejection(withVtimezone(`TZID:A\r\n${observance}`)).message,
      ).toMatch(new RegExp(missing));
    },
  );

  it('rejects an offset that is not an offset', () => {
    const observance = STANDARD.replace('TZOFFSETTO:+0100', 'TZOFFSETTO:soon');

    expect(
      rejection(withVtimezone(`TZID:A\r\n${observance}`)).precondition,
    ).toBe('valid-calendar-data');
  });
});
