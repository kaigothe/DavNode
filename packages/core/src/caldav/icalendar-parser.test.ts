import { describe, expect, it } from 'vitest';
import {
  CalendarParseError,
  parseCalendarObject,
  type CalendarPrecondition,
} from './icalendar-parser.js';

/** Wraps `body` in a VCALENDAR (CRLF line endings, as iCalendar requires). */
function calendar(
  body: string,
  header = 'VERSION:2.0\nPRODID:-//DavNode//Test//EN\n',
): string {
  return `BEGIN:VCALENDAR\n${header}${body}END:VCALENDAR\n`.replace(
    /\n/g,
    '\r\n',
  );
}

function vevent(lines: string[]): string {
  return `BEGIN:VEVENT\n${lines.join('\n')}\nEND:VEVENT\n`;
}

const BERLIN_VTIMEZONE = `BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
`;

function rejection(text: string): CalendarParseError {
  try {
    parseCalendarObject(text);
  } catch (error) {
    expect(error).toBeInstanceOf(CalendarParseError);
    return error as CalendarParseError;
  }
  throw new Error('Expected parseCalendarObject to throw, but it returned.');
}

function expectRejected(
  text: string,
  precondition: CalendarPrecondition,
  message?: RegExp,
): void {
  const error = rejection(text);
  expect(error.precondition).toBe(precondition);
  if (message) {
    expect(error.message).toMatch(message);
  }
}

describe('parseCalendarObject', () => {
  describe('accepted objects', () => {
    it('parses a single non-recurring VEVENT', () => {
      const parsed = parseCalendarObject(
        calendar(
          vevent([
            'UID:1@example.com',
            'DTSTAMP:20041210T183904Z',
            'DTSTART:20041207T120000Z',
            'DTEND:20041207T130000Z',
            'SUMMARY:One-off Meeting',
          ]),
        ),
      );

      expect(parsed.uid).toBe('1@example.com');
      expect(parsed.componentType).toBe('VEVENT');
      expect(parsed.overrides).toEqual([]);
      expect(parsed.timezones).toEqual([]);
      expect(parsed.master).toEqual({
        dtstart: {
          kind: 'utc',
          year: 2004,
          month: 12,
          day: 7,
          hour: 12,
          minute: 0,
          second: 0,
          tzid: null,
        },
        dtend: {
          kind: 'utc',
          year: 2004,
          month: 12,
          day: 7,
          hour: 13,
          minute: 0,
          second: 0,
          tzid: null,
        },
        duration: null,
        isAllDay: false,
        rrule: null,
        rdate: [],
        exdate: [],
        recurrenceId: null,
        transparency: 'opaque',
        status: null,
        summary: 'One-off Meeting',
      });
    });

    it('splits a recurring event with a moved instance into master and override (the RFC 4791 §4.1 example)', () => {
      const parsed = parseCalendarObject(
        calendar(
          vevent([
            'UID:2@example.com',
            'SUMMARY:Weekly Meeting',
            'DTSTAMP:20041210T183838Z',
            'DTSTART:20041206T120000Z',
            'DTEND:20041206T130000Z',
            'RRULE:FREQ=WEEKLY',
          ]) +
            vevent([
              'UID:2@example.com',
              'SUMMARY:Weekly Meeting',
              'RECURRENCE-ID:20041213T120000Z',
              'DTSTAMP:20041210T183838Z',
              'DTSTART:20041213T130000Z',
              'DTEND:20041213T140000Z',
            ]),
        ),
      );

      expect(parsed.master?.rrule).toBe('FREQ=WEEKLY');
      expect(parsed.master?.recurrenceId).toBeNull();
      expect(parsed.overrides).toHaveLength(1);
      expect(parsed.overrides[0]?.recurrenceId).toMatchObject({
        kind: 'utc',
        day: 13,
        hour: 12,
      });
      expect(parsed.overrides[0]?.dtstart).toMatchObject({ day: 13, hour: 13 });
      expect(parsed.overrides[0]?.rrule).toBeNull();
    });

    it('assigns a master and two overrides of the same UID with different RECURRENCE-IDs correctly, in document order', () => {
      const parsed = parseCalendarObject(
        calendar(
          vevent([
            'UID:s',
            'DTSTART:20260601T090000Z',
            'DTEND:20260601T100000Z',
            'RRULE:FREQ=DAILY;COUNT=10',
          ]) +
            vevent([
              'UID:s',
              'RECURRENCE-ID:20260603T090000Z',
              'DTSTART:20260603T110000Z',
              'DTEND:20260603T120000Z',
            ]) +
            vevent([
              'UID:s',
              'RECURRENCE-ID:20260605T090000Z',
              'DTSTART:20260605T080000Z',
              'DTEND:20260605T090000Z',
            ]),
        ),
      );

      expect(parsed.master?.rrule).toBe('FREQ=DAILY;COUNT=10');
      expect(
        parsed.overrides.map((o) => [o.recurrenceId?.day, o.dtstart.hour]),
      ).toEqual([
        [3, 11],
        [5, 8],
      ]);
    });

    it('accepts an object of overrides only (RFC 4791 §4.1) — master is null', () => {
      const parsed = parseCalendarObject(
        calendar(
          vevent([
            'UID:only',
            'RECURRENCE-ID:20260603T090000Z',
            'DTSTART:20260603T110000Z',
            'DTEND:20260603T120000Z',
          ]),
        ),
      );

      expect(parsed.master).toBeNull();
      expect(parsed.overrides).toHaveLength(1);
      expect(parsed.uid).toBe('only');
    });

    it('reads an all-day event: DATE values, isAllDay, exclusive DATE end', () => {
      const parsed = parseCalendarObject(
        calendar(
          vevent([
            'UID:d',
            'DTSTART;VALUE=DATE:20260924',
            'DTEND;VALUE=DATE:20260926',
          ]),
        ),
      );

      expect(parsed.master?.isAllDay).toBe(true);
      expect(parsed.master?.dtstart).toEqual({
        kind: 'date',
        year: 2026,
        month: 9,
        day: 24,
        hour: 0,
        minute: 0,
        second: 0,
        tzid: null,
      });
      expect(parsed.master?.dtend).toMatchObject({ kind: 'date', day: 26 });
    });

    it('reads a floating time as floating and a TZID time as zoned, keeping the VTIMEZONE as text', () => {
      const parsed = parseCalendarObject(
        calendar(
          BERLIN_VTIMEZONE.replace(/\n/g, '\n') +
            vevent([
              'UID:z',
              'DTSTART;TZID=Europe/Berlin:20261025T090000',
              'DTEND:20261025T100000',
            ]),
        ),
      );

      expect(parsed.master?.dtstart).toMatchObject({
        kind: 'zoned',
        tzid: 'Europe/Berlin',
        hour: 9,
      });
      expect(parsed.master?.dtend).toMatchObject({
        kind: 'floating',
        tzid: null,
        hour: 10,
      });
      expect(parsed.timezones).toHaveLength(1);
      expect(parsed.timezones[0]?.tzid).toBe('Europe/Berlin');
      expect(parsed.timezones[0]?.vtimezone).toContain('BEGIN:VTIMEZONE');
      expect(parsed.timezones[0]?.vtimezone).toContain('END:VTIMEZONE');
    });

    it('accepts an IANA TZID the object carries no VTIMEZONE for', () => {
      const parsed = parseCalendarObject(
        calendar(
          vevent([
            'UID:i',
            'DTSTART;TZID=America/New_York:20261101T013000',
            'DURATION:PT1H',
          ]),
        ),
      );

      expect(parsed.master?.dtstart).toMatchObject({
        kind: 'zoned',
        tzid: 'America/New_York',
      });
      expect(parsed.master?.duration).toBe('PT1H');
      expect(parsed.master?.dtend).toBeNull();
    });

    it('reads RRULE, RDATE (DATE-TIME and PERIOD) and EXDATE values, several per line and across lines', () => {
      const parsed = parseCalendarObject(
        calendar(
          vevent([
            'UID:r',
            'DTSTART:20260601T090000Z',
            'DTEND:20260601T100000Z',
            'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T000000Z',
            'RDATE:20260602T090000Z,20260603T090000Z',
            'RDATE;VALUE=PERIOD:20260610T090000Z/20260610T120000Z,20260611T090000Z/PT2H',
            'EXDATE:20260608T090000Z',
            'EXDATE:20260615T090000Z,20260622T090000Z',
          ]),
        ),
      );

      expect(parsed.master?.rrule).toBe(
        'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T000000Z',
      );
      expect(
        parsed.master?.rdate.map((r) => [
          r.start.day,
          r.end?.hour ?? null,
          r.duration,
        ]),
      ).toEqual([
        [2, null, null],
        [3, null, null],
        [10, 12, null],
        [11, null, 'PT2H'],
      ]);
      expect(parsed.master?.exdate.map((e) => e.day)).toEqual([8, 15, 22]);
    });

    it('maps TRANSP and STATUS, defaulting to opaque and no status', () => {
      const parse = (extra: string[]) =>
        parseCalendarObject(
          calendar(vevent(['UID:t', 'DTSTART:20260601T090000Z', ...extra])),
        ).master;

      expect(parse(['TRANSP:TRANSPARENT', 'STATUS:CANCELLED'])).toMatchObject({
        transparency: 'transparent',
        status: 'cancelled',
      });
      expect(parse(['TRANSP:transparent', 'STATUS:Tentative'])).toMatchObject({
        transparency: 'transparent',
        status: 'tentative',
      });
      expect(parse(['TRANSP:OPAQUE', 'STATUS:CONFIRMED'])).toMatchObject({
        transparency: 'opaque',
        status: 'confirmed',
      });
      expect(parse([])).toMatchObject({ transparency: 'opaque', status: null });
      expect(parse(['STATUS:NEEDS-ACTION'])).toMatchObject({ status: null });
    });

    it('ignores RRULE, RDATE and EXDATE on an override, which replaces one instance and does not recur', () => {
      const parsed = parseCalendarObject(
        calendar(
          vevent([
            'UID:o',
            'DTSTART:20260601T090000Z',
            'RRULE:FREQ=DAILY;COUNT=5',
          ]) +
            vevent([
              'UID:o',
              'RECURRENCE-ID:20260602T090000Z',
              'DTSTART:20260602T100000Z',
              'RRULE:FREQ=DAILY',
              'RDATE:20260630T090000Z',
              'EXDATE:20260603T090000Z',
            ]),
        ),
      );

      expect(parsed.overrides[0]).toMatchObject({
        rrule: null,
        rdate: [],
        exdate: [],
      });
    });

    it('unfolds folded lines, tolerates a byte order mark and bare LF line endings', () => {
      const text = `${String.fromCharCode(0xfeff)}BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//x//EN\nBEGIN:VEVENT\nUID:f\nDTSTART:20260601T090000Z\nSUMMARY:A very long summary that\n  continues on the next line\nEND:VEVENT\nEND:VCALENDAR\n`;

      expect(parseCalendarObject(text).master?.summary).toBe(
        'A very long summary that continues on the next line',
      );
    });
  });

  describe('rejected objects', () => {
    it('rejects a document with two different UIDs (valid-calendar-object-resource)', () => {
      expectRejected(
        calendar(
          vevent(['UID:a', 'DTSTART:20260601T090000Z']) +
            vevent(['UID:b', 'DTSTART:20260602T090000Z']),
        ),
        'valid-calendar-object-resource',
        /same UID/,
      );
    });

    it('rejects a VTODO clearly as an unsupported component', () => {
      const error = rejection(
        calendar(
          'BEGIN:VTODO\nUID:t\nDTSTAMP:20260601T000000Z\nSUMMARY:Do it\nEND:VTODO\n',
        ),
      );

      expect(error.precondition).toBe('supported-calendar-component');
      expect(error.message).toMatch(/VTODO is not supported/);
    });

    it('rejects VJOURNAL and VFREEBUSY the same way', () => {
      expectRejected(
        calendar(
          'BEGIN:VJOURNAL\nUID:j\nDTSTAMP:20260601T000000Z\nEND:VJOURNAL\n',
        ),
        'supported-calendar-component',
        /VJOURNAL/,
      );
      expectRejected(
        calendar(
          'BEGIN:VFREEBUSY\nUID:f\nDTSTAMP:20260601T000000Z\nEND:VFREEBUSY\n',
        ),
        'supported-calendar-component',
        /VFREEBUSY/,
      );
    });

    it('rejects a mix of component types (VEVENT + VTODO) as an invalid resource', () => {
      expectRejected(
        calendar(
          vevent(['UID:m', 'DTSTART:20260601T090000Z']) +
            'BEGIN:VTODO\nUID:m\nDTSTAMP:20260601T000000Z\nEND:VTODO\n',
        ),
        'valid-calendar-object-resource',
        /more than one type/,
      );
    });

    it('rejects a second master and two overrides for the same RECURRENCE-ID', () => {
      expectRejected(
        calendar(
          vevent(['UID:s', 'DTSTART:20260601T090000Z']) +
            vevent(['UID:s', 'DTSTART:20260602T090000Z']),
        ),
        'valid-calendar-object-resource',
        /only one master/,
      );
      expectRejected(
        calendar(
          vevent([
            'UID:s',
            'RECURRENCE-ID:20260603T090000Z',
            'DTSTART:20260603T110000Z',
          ]) +
            vevent([
              'UID:s',
              'RECURRENCE-ID:20260603T090000Z',
              'DTSTART:20260603T120000Z',
            ]),
        ),
        'valid-calendar-object-resource',
        /same RECURRENCE-ID/,
      );
    });

    it('rejects a METHOD (RFC 4791 §4.1), a missing or wrong VERSION, and an empty calendar', () => {
      expectRejected(
        calendar(
          vevent(['UID:a', 'DTSTART:20260601T090000Z']),
          'VERSION:2.0\nMETHOD:REQUEST\n',
        ),
        'valid-calendar-object-resource',
        /METHOD/,
      );
      expectRejected(
        calendar(
          vevent(['UID:a', 'DTSTART:20260601T090000Z']),
          'PRODID:-//x//EN\n',
        ),
        'valid-calendar-data',
        /VERSION/,
      );
      expectRejected(
        calendar(
          vevent(['UID:a', 'DTSTART:20260601T090000Z']),
          'VERSION:1.0\n',
        ),
        'valid-calendar-data',
        /VERSION/,
      );
      expectRejected(
        calendar(''),
        'valid-calendar-object-resource',
        /no calendar component/,
      );
    });

    it('rejects text that is not iCalendar, and more than one VCALENDAR', () => {
      expectRejected('this is not an iCalendar', 'valid-calendar-data');
      expectRejected('', 'valid-calendar-data');
      expectRejected(
        'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:A\r\nEND:VCARD\r\n',
        'valid-calendar-data',
      );
      const one = calendar(vevent(['UID:a', 'DTSTART:20260601T090000Z']));
      expectRejected(
        one + one,
        'valid-calendar-data',
        /more than one VCALENDAR/,
      );
    });

    it('rejects a VEVENT without UID or DTSTART', () => {
      expectRejected(
        calendar(vevent(['DTSTART:20260601T090000Z'])),
        'valid-calendar-object-resource',
        /UID/,
      );
      expectRejected(
        calendar(vevent(['UID:a'])),
        'valid-calendar-data',
        /DTSTART/,
      );
    });

    it('rejects DTEND together with DURATION, DTEND before DTSTART, and mixed DATE/DATE-TIME', () => {
      expectRejected(
        calendar(
          vevent([
            'UID:a',
            'DTSTART:20260601T090000Z',
            'DTEND:20260601T100000Z',
            'DURATION:PT1H',
          ]),
        ),
        'valid-calendar-data',
        /both DTEND and DURATION/,
      );
      expectRejected(
        calendar(
          vevent([
            'UID:a',
            'DTSTART:20260601T090000Z',
            'DTEND:20260601T080000Z',
          ]),
        ),
        'valid-calendar-data',
        /before DTSTART/,
      );
      expectRejected(
        calendar(
          vevent([
            'UID:a',
            'DTSTART;VALUE=DATE:20260601',
            'DTEND:20260601T100000Z',
          ]),
        ),
        'valid-calendar-data',
        /both DATE/,
      );
      expectRejected(
        calendar(
          vevent(['UID:a', 'DTSTART:20260601T090000Z', 'DURATION:-PT1H']),
        ),
        'valid-calendar-data',
        /negative/,
      );
    });

    it('accepts a zero-length event (DTEND equal to DTSTART)', () => {
      expect(
        parseCalendarObject(
          calendar(
            vevent([
              'UID:a',
              'DTSTART:20260601T090000Z',
              'DTEND:20260601T090000Z',
            ]),
          ),
        ).master?.dtend,
      ).toMatchObject({ hour: 9 });
    });

    it('rejects dates and times that do not exist', () => {
      expectRejected(
        calendar(vevent(['UID:a', 'DTSTART;VALUE=DATE:20260230'])),
        'valid-calendar-data',
        /not a real/,
      );
      expectRejected(
        calendar(vevent(['UID:a', 'DTSTART:20260601T250000Z'])),
        'valid-calendar-data',
      );
      expectRejected(
        calendar(vevent(['UID:a', 'DTSTART:2026'])),
        'valid-calendar-data',
      );
    });

    it('rejects a TZID that nothing defines, naming it (valid-calendar-object-resource)', () => {
      expectRejected(
        calendar(
          vevent(['UID:a', 'DTSTART;TZID=Nowhere/Land:20260601T090000']),
        ),
        'valid-calendar-object-resource',
        /"Nowhere\/Land"/,
      );
      // Windows-style names are not IANA; without a VTIMEZONE they cannot be placed.
      expectRejected(
        calendar(
          vevent([
            'UID:a',
            'DTSTART;TZID=W. Europe Standard Time:20260601T090000',
          ]),
        ),
        'valid-calendar-object-resource',
      );
    });

    it('rejects a VTIMEZONE without rules or without TZID, and a repeated TZID', () => {
      expectRejected(
        calendar(
          'BEGIN:VTIMEZONE\nTZID:Empty/Zone\nEND:VTIMEZONE\n' +
            vevent(['UID:a', 'DTSTART:20260601T090000Z']),
        ),
        'valid-calendar-data',
        /no STANDARD or DAYLIGHT/,
      );
      expectRejected(
        calendar(
          BERLIN_VTIMEZONE +
            BERLIN_VTIMEZONE +
            vevent(['UID:a', 'DTSTART:20260601T090000Z']),
        ),
        'valid-calendar-object-resource',
        /more than once/,
      );
    });

    it('rejects a recurrence rule that is malformed or cannot be evaluated', () => {
      expectRejected(
        calendar(
          vevent(['UID:a', 'DTSTART:20260601T090000Z', 'RRULE:FREQ=SOMETIMES']),
        ),
        'valid-calendar-data',
      );
      expectRejected(
        calendar(
          vevent(['UID:a', 'DTSTART:20260601T090000Z', 'RRULE:COUNT=5']),
        ),
        'valid-calendar-data',
      );
      expectRejected(
        calendar(
          vevent([
            'UID:a',
            'DTSTART:20260601T090000Z',
            'RRULE:FREQ=DAILY',
            'RRULE:FREQ=WEEKLY',
          ]),
        ),
        'valid-calendar-data',
        /at most once/,
      );
    });
  });

  it('never leaks a non-CalendarParseError for hostile input', () => {
    for (const text of [
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20260601T090000Z\r\nRRULE:FREQ=DAILY;INTERVAL=abc\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20260601T090000Z\r\nEND:VCALENDAR\r\n',
      '\u0000\u0001BEGIN:VCALENDAR',
    ]) {
      expect(rejection(text)).toBeInstanceOf(CalendarParseError);
    }
  });
});
