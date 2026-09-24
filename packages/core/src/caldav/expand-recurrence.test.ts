import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_RECURRENCE_INSTANCES,
  RecurrenceLimitError,
  computeRecurrenceSpanEnd,
  expandOccurrences,
} from './expand-recurrence.js';
import { parseCalendarObject } from './icalendar-parser.js';

const BERLIN_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** One iCalendar object from VEVENT blocks (each a list of lines); CRLF-joined. */
function object(
  events: string[][],
  preamble: string[] = [],
): ReturnType<typeof parseCalendarObject> {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//t//EN',
    ...preamble,
    ...events.flatMap((event) => ['BEGIN:VEVENT', ...event, 'END:VEVENT']),
    'END:VCALENDAR',
    '',
  ];
  return parseCalendarObject(lines.join('\r\n'));
}

const iso = (occurrences: { start: Date }[]): string[] =>
  occurrences.map((o) => o.start.toISOString().slice(0, 16) + 'Z');
const at = (s: string) => new Date(s);

describe('expandOccurrences', () => {
  describe('basic sets', () => {
    it('gives an object without RRULE or RDATE a single occurrence, if it is in range', () => {
      const parsed = object([
        ['UID:a', 'DTSTART:20260924T100000Z', 'DTEND:20260924T110000Z'],
      ]);

      expect(
        iso(
          expandOccurrences(
            parsed,
            at('2026-09-24T00:00:00Z'),
            at('2026-09-25T00:00:00Z'),
          ),
        ),
      ).toEqual(['2026-09-24T10:00Z']);
      expect(
        expandOccurrences(
          parsed,
          at('2026-09-25T00:00:00Z'),
          at('2026-09-26T00:00:00Z'),
        ),
      ).toEqual([]);
    });

    it('a weekly RRULE over three months yields exactly the occurrences in a one-month range', () => {
      const parsed = object([
        [
          'UID:w',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=WEEKLY;UNTIL=20260831T000000Z',
        ],
      ]);

      const july = expandOccurrences(
        parsed,
        at('2026-07-01T00:00:00Z'),
        at('2026-08-01T00:00:00Z'),
      );

      // Mondays in July 2026: 6, 13, 20, 27.
      expect(iso(july)).toEqual([
        '2026-07-06T09:00Z',
        '2026-07-13T09:00Z',
        '2026-07-20T09:00Z',
        '2026-07-27T09:00Z',
      ]);
      expect(
        july.every((o) => o.end.getTime() - o.start.getTime() === 3_600_000),
      ).toBe(true);
      // The whole series: Mondays Jun 1 .. Aug 24; Aug 31 09:00 is after UNTIL (Aug 31 00:00) -> 13.
      expect(expandOccurrences(parsed, null, null)).toHaveLength(13);
    });

    it('an EXDATE removes exactly the affected instance and no other', () => {
      const parsed = object([
        [
          'UID:e',
          'DTSTART:20260601T090000Z',
          'RRULE:FREQ=DAILY;COUNT=5',
          'EXDATE:20260603T090000Z',
        ],
      ]);

      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2026-06-01T09:00Z',
        '2026-06-02T09:00Z',
        '2026-06-04T09:00Z',
        '2026-06-05T09:00Z',
      ]);
    });

    it('an EXDATE naming the first instance (DTSTART itself) removes it too', () => {
      const parsed = object([
        [
          'UID:e',
          'DTSTART:20260601T090000Z',
          'RRULE:FREQ=DAILY;COUNT=3',
          'EXDATE:20260601T090000Z',
        ],
      ]);

      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2026-06-02T09:00Z',
        '2026-06-03T09:00Z',
      ]);
    });

    it('does not count a DTSTART that does not fit its rule as an instance, and COUNT counts only matches', () => {
      // 2026-01-15 is a Thursday; the rule is Monday/Wednesday/Friday.
      const parsed = object([
        [
          'UID:u',
          'DTSTART:20260115T083000Z',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=4',
        ],
      ]);

      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2026-01-16T08:30Z',
        '2026-01-19T08:30Z',
        '2026-01-21T08:30Z',
        '2026-01-23T08:30Z',
      ]);
    });

    it('skips the months a day does not exist in (RFC 5545 §3.3.10) and counts only real instances', () => {
      const parsed = object([
        ['UID:m', 'DTSTART:20260131T090000Z', 'RRULE:FREQ=MONTHLY;COUNT=5'],
      ]);

      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2026-01-31T09:00Z',
        '2026-03-31T09:00Z',
        '2026-05-31T09:00Z',
        '2026-07-31T09:00Z',
        '2026-08-31T09:00Z',
      ]);
    });

    it('puts a leap-day rule with BYMONTH/BYMONTHDAY only in leap years', () => {
      const parsed = object([
        [
          'UID:l',
          'DTSTART:20240229T090000Z',
          'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=3',
        ],
      ]);

      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2024-02-29T09:00Z',
        '2028-02-29T09:00Z',
        '2032-02-29T09:00Z',
      ]);
    });

    it('known deviation from RFC 5545 inherited from ical.js: a plain FREQ=YEARLY from 29 February lands on 1 March in non-leap years', () => {
      // RFC 5545 §3.3.10 says these instances MUST be ignored; libical/ical.js (and so Thunderbird) shift them.
      // If ical.js is upgraded and this starts failing, the new behaviour is the RFC's: update the test and the doc comment.
      const parsed = object([
        ['UID:l', 'DTSTART;VALUE=DATE:20240229', 'RRULE:FREQ=YEARLY;COUNT=4'],
      ]);

      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2024-02-29T00:00Z',
        '2025-03-01T00:00Z',
        '2026-03-01T00:00Z',
        '2027-03-01T00:00Z',
      ]);
    });

    it('adds RDATEs to the set, merged in order and de-duplicated with rule instances', () => {
      const parsed = object([
        [
          'UID:r',
          'DTSTART:20260601T090000Z',
          'RRULE:FREQ=WEEKLY;COUNT=2',
          'RDATE:20260603T090000Z,20260608T090000Z,20260701T090000Z',
        ],
      ]);

      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2026-06-01T09:00Z',
        '2026-06-03T09:00Z',
        '2026-06-08T09:00Z',
        '2026-07-01T09:00Z',
      ]);
    });

    it('takes an RDATE PERIOD’s own end', () => {
      const parsed = object([
        [
          'UID:p',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RDATE;VALUE=PERIOD:20260610T090000Z/20260610T120000Z,20260611T090000Z/PT2H',
        ],
      ]);

      const all = expandOccurrences(parsed, null, null);

      expect(
        all.map((o) => (o.end.getTime() - o.start.getTime()) / 3_600_000),
      ).toEqual([1, 3, 2]);
    });

    it('reads a recurring all-day event: each instance is a full day', () => {
      const parsed = object([
        ['UID:d', 'DTSTART;VALUE=DATE:20260924', 'RRULE:FREQ=WEEKLY;COUNT=3'],
      ]);

      const all = expandOccurrences(parsed, null, null);

      expect(iso(all)).toEqual([
        '2026-09-24T00:00Z',
        '2026-10-01T00:00Z',
        '2026-10-08T00:00Z',
      ]);
      expect(
        all.every(
          (o) =>
            o.isAllDay && o.end.getTime() - o.start.getTime() === 86_400_000,
        ),
      ).toBe(true);
    });
  });

  describe('overrides (RECURRENCE-ID)', () => {
    const series = [
      'UID:s',
      'DTSTART:20260601T090000Z',
      'DTEND:20260601T100000Z',
      'RRULE:FREQ=DAILY;COUNT=5',
    ];

    it('shows a moved instance at its new time, not at the computed one', () => {
      const parsed = object([
        series,
        [
          'UID:s',
          'RECURRENCE-ID:20260603T090000Z',
          'DTSTART:20260603T140000Z',
          'DTEND:20260603T150000Z',
          'SUMMARY:Moved',
        ],
      ]);

      const all = expandOccurrences(parsed, null, null);

      expect(iso(all)).toEqual([
        '2026-06-01T09:00Z',
        '2026-06-02T09:00Z',
        '2026-06-03T14:00Z',
        '2026-06-04T09:00Z',
        '2026-06-05T09:00Z',
      ]);
      expect(all.map((o) => o.isOverride)).toEqual([
        false,
        false,
        true,
        false,
        false,
      ]);
    });

    it('shows an instance moved off the rule’s rhythm, two days later', () => {
      const parsed = object([
        series,
        [
          'UID:s',
          'RECURRENCE-ID:20260603T090000Z',
          'DTSTART:20260607T090000Z',
          'DTEND:20260607T100000Z',
        ],
      ]);

      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2026-06-01T09:00Z',
        '2026-06-02T09:00Z',
        '2026-06-04T09:00Z',
        '2026-06-05T09:00Z',
        '2026-06-07T09:00Z',
      ]);
    });

    it('finds a moved instance in a range that only contains its new time', () => {
      const parsed = object([
        series,
        [
          'UID:s',
          'RECURRENCE-ID:20260603T090000Z',
          'DTSTART:20260620T090000Z',
          'DTEND:20260620T100000Z',
        ],
      ]);

      expect(
        iso(
          expandOccurrences(
            parsed,
            at('2026-06-19T00:00:00Z'),
            at('2026-06-21T00:00:00Z'),
          ),
        ),
      ).toEqual(['2026-06-20T09:00Z']);
      // ...and no longer has the instance in the range around its original time.
      expect(
        iso(
          expandOccurrences(
            parsed,
            at('2026-06-03T00:00:00Z'),
            at('2026-06-04T00:00:00Z'),
          ),
        ),
      ).toEqual([]);
    });

    it('lets each occurrence carry its own STATUS and TRANSP — a cancelled override does not touch its siblings', () => {
      const parsed = object([
        [...series, 'TRANSP:OPAQUE'],
        [
          'UID:s',
          'RECURRENCE-ID:20260602T090000Z',
          'DTSTART:20260602T090000Z',
          'DTEND:20260602T100000Z',
          'STATUS:CANCELLED',
          'TRANSP:TRANSPARENT',
        ],
      ]);

      const [first, second, third] = expandOccurrences(parsed, null, null);

      expect(first).toMatchObject({ status: null, transparency: 'opaque' });
      expect(second).toMatchObject({
        status: 'cancelled',
        transparency: 'transparent',
        isOverride: true,
      });
      expect(third).toMatchObject({ status: null, transparency: 'opaque' });
    });

    it('expands an object of overrides only to those overrides', () => {
      const parsed = object([
        [
          'UID:o',
          'RECURRENCE-ID:20260603T090000Z',
          'DTSTART:20260603T110000Z',
          'DTEND:20260603T120000Z',
        ],
        [
          'UID:o',
          'RECURRENCE-ID:20260605T090000Z',
          'DTSTART:20260605T080000Z',
          'DTEND:20260605T090000Z',
        ],
      ]);

      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2026-06-03T11:00Z',
        '2026-06-05T08:00Z',
      ]);
    });

    it('matches an override against an all-day instance by date', () => {
      const parsed = object([
        ['UID:d', 'DTSTART;VALUE=DATE:20260601', 'RRULE:FREQ=DAILY;COUNT=3'],
        [
          'UID:d',
          'RECURRENCE-ID;VALUE=DATE:20260602',
          'DTSTART;VALUE=DATE:20260610',
        ],
      ]);

      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2026-06-01T00:00Z',
        '2026-06-03T00:00Z',
        '2026-06-10T00:00Z',
      ]);
    });
  });

  describe('time zones', () => {
    it('keeps a TZID series at the same local time across the autumn DST change', () => {
      const parsed = object(
        [
          [
            'UID:t',
            'DTSTART;TZID=Europe/Berlin:20261023T090000',
            'DTEND;TZID=Europe/Berlin:20261023T100000',
            'RRULE:FREQ=DAILY;COUNT=5',
          ],
        ],
        BERLIN_VTIMEZONE,
      );

      // 09:00 CEST = 07:00Z until the clocks go back on Oct 25, then 09:00 CET = 08:00Z.
      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2026-10-23T07:00Z',
        '2026-10-24T07:00Z',
        '2026-10-25T08:00Z',
        '2026-10-26T08:00Z',
        '2026-10-27T08:00Z',
      ]);
    });

    it('keeps a TZID series at the same local time across the spring change, also without a VTIMEZONE (IANA)', () => {
      const parsed = object([
        [
          'UID:t',
          'DTSTART;TZID=Europe/Berlin:20260327T090000',
          'DTEND;TZID=Europe/Berlin:20260327T100000',
          'RRULE:FREQ=DAILY;COUNT=4',
        ],
      ]);

      // 09:00 CET = 08:00Z until Mar 29 (clocks forward at 02:00), then 09:00 CEST = 07:00Z.
      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2026-03-27T08:00Z',
        '2026-03-28T08:00Z',
        '2026-03-29T07:00Z',
        '2026-03-30T07:00Z',
      ]);
    });

    it('keeps a weekly series in New York at local time over both changes in a year', () => {
      const parsed = object([
        [
          'UID:n',
          'DTSTART;TZID=America/New_York:20260301T120000',
          'DTEND;TZID=America/New_York:20260301T130000',
          'RRULE:FREQ=MONTHLY;COUNT=12',
        ],
      ]);

      const offsets = new Set(
        expandOccurrences(parsed, null, null).map((o) => o.start.getUTCHours()),
      );

      expect([...offsets].sort()).toEqual([16, 17]); // 12:00 EDT = 16Z, 12:00 EST = 17Z
    });

    it('reads floating times as UTC by default and in the given zone when asked', () => {
      const parsed = object([
        ['UID:f', 'DTSTART:20260715T090000', 'DTEND:20260715T100000'],
      ]);

      expect(iso(expandOccurrences(parsed, null, null))).toEqual([
        '2026-07-15T09:00Z',
      ]);
      expect(
        iso(
          expandOccurrences(parsed, null, null, {
            floatingTimeZone: 'Europe/Berlin',
          }),
        ),
      ).toEqual(['2026-07-15T07:00Z']);
      expect(
        iso(
          expandOccurrences(parsed, null, null, {
            floatingTimeZone: 'America/Los_Angeles',
          }),
        ),
      ).toEqual(['2026-07-15T16:00Z']);
    });

    describe('independence of the process time zone', () => {
      const original = process.env.TZ;
      afterEach(() => {
        if (original === undefined) {
          delete process.env.TZ;
        } else {
          process.env.TZ = original;
        }
      });

      it('gives the same occurrences under every process TZ', () => {
        const parsed = object(
          [
            [
              'UID:x',
              'DTSTART;TZID=Europe/Berlin:20261023T090000',
              'RRULE:FREQ=DAILY;COUNT=5',
            ],
            [
              'UID:x',
              'RECURRENCE-ID;TZID=Europe/Berlin:20261025T090000',
              'DTSTART;VALUE=DATE:20261025',
            ],
          ],
          BERLIN_VTIMEZONE,
        );
        const results = [
          'UTC',
          'Europe/Berlin',
          'America/Los_Angeles',
          'Asia/Kolkata',
          'Pacific/Auckland',
        ].map((tz) => {
          process.env.TZ = tz;
          return JSON.stringify(
            expandOccurrences(parsed, null, null, {
              floatingTimeZone: 'America/New_York',
            }),
          );
        });

        expect(new Set(results).size).toBe(1);
      });
    });
  });

  describe('range semantics (RFC 4791 §9.9)', () => {
    it('includes an event that started before the range and ends inside it, and excludes one that ends exactly at the range start', () => {
      const parsed = object([
        ['UID:o', 'DTSTART:20260924T090000Z', 'DTEND:20260924T110000Z'],
      ]);

      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T10:00:00Z'),
          at('2026-09-24T12:00:00Z'),
        ),
      ).toHaveLength(1);
      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T11:00:00Z'),
          at('2026-09-24T12:00:00Z'),
        ),
      ).toHaveLength(0);
    });

    it('excludes an event that starts exactly at the exclusive range end', () => {
      const parsed = object([
        ['UID:o', 'DTSTART:20260924T090000Z', 'DTEND:20260924T110000Z'],
      ]);

      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T07:00:00Z'),
          at('2026-09-24T09:00:00Z'),
        ),
      ).toHaveLength(0);
      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T07:00:00Z'),
          at('2026-09-24T09:00:01Z'),
        ),
      ).toHaveLength(1);
    });

    it('counts a point event (DATE-TIME start, no end) at the range start but not at the range end', () => {
      const parsed = object([['UID:p', 'DTSTART:20260924T090000Z']]);

      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T09:00:00Z'),
          at('2026-09-24T10:00:00Z'),
        ),
      ).toHaveLength(1);
      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T08:00:00Z'),
          at('2026-09-24T09:00:00Z'),
        ),
      ).toHaveLength(0);
      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T09:00:01Z'),
          at('2026-09-24T10:00:00Z'),
        ),
      ).toHaveLength(0);
    });

    it('applies the same point-event rule to an override, which is tested without the master loop', () => {
      const parsed = object([
        ['UID:p', 'RECURRENCE-ID:20260924T090000Z', 'DTSTART:20260924T090000Z'],
      ]);

      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T09:00:00Z'),
          at('2026-09-24T10:00:00Z'),
        ),
      ).toHaveLength(1);
      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T08:00:00Z'),
          at('2026-09-24T09:00:00Z'),
        ),
      ).toHaveLength(0);
      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T09:00:01Z'),
          at('2026-09-24T10:00:00Z'),
        ),
      ).toHaveLength(0);
    });

    it('applies the RFC’s strict first row to a zero-length event with an explicit DTEND (not matched at the range start)', () => {
      const parsed = object([
        ['UID:p', 'DTSTART:20260924T090000Z', 'DTEND:20260924T090000Z'],
      ]);

      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T09:00:00Z'),
          at('2026-09-24T10:00:00Z'),
        ),
      ).toHaveLength(0);
      expect(
        expandOccurrences(
          parsed,
          at('2026-09-24T08:00:00Z'),
          at('2026-09-24T10:00:00Z'),
        ),
      ).toHaveLength(1);
    });

    it('matches an all-day event on every day it spans and not on the day after its exclusive end', () => {
      const parsed = object([
        ['UID:d', 'DTSTART;VALUE=DATE:20260924', 'DTEND;VALUE=DATE:20260926'],
      ]);
      const day = (d: number) =>
        expandOccurrences(
          parsed,
          at(`2026-09-${d}T00:00:00Z`),
          at(`2026-09-${d + 1}T00:00:00Z`),
        ).length;

      expect([day(23), day(24), day(25), day(26)]).toEqual([0, 1, 1, 0]);
    });

    it('supports ranges open at one or both ends', () => {
      const parsed = object([
        ['UID:w', 'DTSTART:20260601T090000Z', 'RRULE:FREQ=DAILY;COUNT=10'],
      ]);

      expect(
        expandOccurrences(parsed, at('2026-06-08T00:00:00Z'), null),
      ).toHaveLength(3);
      expect(
        expandOccurrences(parsed, null, at('2026-06-03T00:00:00Z')),
      ).toHaveLength(2);
      expect(expandOccurrences(parsed, null, null)).toHaveLength(10);
    });

    it('returns occurrences in ascending order even when overrides interleave', () => {
      const parsed = object([
        ['UID:s', 'DTSTART:20260601T090000Z', 'RRULE:FREQ=DAILY;COUNT=4'],
        ['UID:s', 'RECURRENCE-ID:20260601T090000Z', 'DTSTART:20260602T120000Z'],
      ]);

      const starts = expandOccurrences(parsed, null, null).map((o) =>
        o.start.getTime(),
      );

      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });

    it('is consistent: any range yields exactly the overlapping members of the full expansion', () => {
      const parsed = object(
        [
          [
            'UID:c',
            'DTSTART;TZID=Europe/Berlin:20260320T083000',
            'DTEND;TZID=Europe/Berlin:20260320T101500',
            'RRULE:FREQ=DAILY;INTERVAL=2;COUNT=40',
            'EXDATE;TZID=Europe/Berlin:20260324T083000',
            'RDATE;TZID=Europe/Berlin:20260401T180000',
          ],
          [
            'UID:c',
            'RECURRENCE-ID;TZID=Europe/Berlin:20260326T083000',
            'DTSTART;TZID=Europe/Berlin:20260410T070000',
            'DTEND;TZID=Europe/Berlin:20260410T073000',
          ],
        ],
        BERLIN_VTIMEZONE,
      );
      const all = expandOccurrences(parsed, null, null);

      for (let d = 15; d < 120; d += 7) {
        const from = new Date(Date.UTC(2026, 2, 1) + d * 86_400_000);
        const to = new Date(
          from.getTime() + (1 + (d % 5)) * 86_400_000 + 3_600_000 * (d % 7),
        );
        const expected = all.filter((o) => o.start < to && o.end > from);

        expect(expandOccurrences(parsed, from, to)).toEqual(expected);
      }
    });
  });

  describe('limits', () => {
    it('throws RecurrenceLimitError for a hostile rule instead of spinning', () => {
      const parsed = object([
        [
          'UID:h',
          'DTSTART:20200101T000000Z',
          'RRULE:FREQ=SECONDLY;COUNT=999999999',
        ],
      ]);
      const started = Date.now();

      expect(() =>
        expandOccurrences(
          parsed,
          at('2026-01-01T00:00:00Z'),
          at('2026-01-02T00:00:00Z'),
        ),
      ).toThrow(RecurrenceLimitError);
      expect(Date.now() - started).toBeLessThan(3000);
    });

    it('honours a custom instance limit', () => {
      const parsed = object([
        ['UID:h', 'DTSTART:20260101T000000Z', 'RRULE:FREQ=DAILY;COUNT=100'],
      ]);

      expect(() =>
        expandOccurrences(parsed, null, null, { maxInstances: 10 }),
      ).toThrow(RecurrenceLimitError);
      expect(
        expandOccurrences(parsed, null, null, { maxInstances: 1000 }),
      ).toHaveLength(100);
    });

    it('walks as many instances as the default limit allows', () => {
      const parsed = object([
        [
          'UID:h',
          'DTSTART:20200101T000000Z',
          `RRULE:FREQ=HOURLY;COUNT=${MAX_RECURRENCE_INSTANCES - 10}`,
        ],
      ]);

      expect(expandOccurrences(parsed, null, null)).toHaveLength(
        MAX_RECURRENCE_INSTANCES - 10,
      );
    });
  });
});

describe('computeRecurrenceSpanEnd', () => {
  const span = (events: string[][], preamble: string[] = []) =>
    computeRecurrenceSpanEnd(object(events, preamble))
      ?.toISOString()
      .slice(0, 16) ?? null;

  it('is the end of a non-recurring event', () => {
    expect(
      span([['UID:a', 'DTSTART:20260924T100000Z', 'DTEND:20260924T113000Z']]),
    ).toBe('2026-09-24T11:30');
  });

  it('is null for FREQ=DAILY without UNTIL or COUNT (recurs without end)', () => {
    expect(
      span([['UID:a', 'DTSTART:20260924T100000Z', 'RRULE:FREQ=DAILY']]),
    ).toBeNull();
    expect(
      span([
        ['UID:a', 'DTSTART:20260924T100000Z', 'RRULE:FREQ=WEEKLY;INTERVAL=2'],
      ]),
    ).toBeNull();
  });

  it('is the end of the COUNT-th instance', () => {
    expect(
      span([
        [
          'UID:a',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=DAILY;COUNT=10',
        ],
      ]),
    ).toBe('2026-06-10T10:00');
    expect(
      span([
        [
          'UID:a',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=WEEKLY;COUNT=4',
        ],
      ]),
    ).toBe('2026-06-22T10:00');
  });

  it('is the end of the last instance under UNTIL — later than UNTIL itself when the instance runs past it', () => {
    // The last Monday on or before UNTIL (Jun 22 09:00) starts at UNTIL and ends an hour later.
    expect(
      span([
        [
          'UID:a',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=WEEKLY;UNTIL=20260622T090000Z',
        ],
      ]),
    ).toBe('2026-06-22T10:00');
    expect(
      span([
        [
          'UID:a',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=WEEKLY;UNTIL=20260625T000000Z',
        ],
      ]),
    ).toBe('2026-06-22T10:00');
  });

  it('accounts for EXDATE: the excluded last instance no longer counts, the previous one does', () => {
    expect(
      span([
        [
          'UID:a',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=DAILY;COUNT=5',
          'EXDATE:20260605T090000Z',
        ],
      ]),
    ).toBe('2026-06-04T10:00');
  });

  it('extends over an RDATE beyond the rule’s end and over an override moved past the last instance', () => {
    expect(
      span([
        [
          'UID:a',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=DAILY;COUNT=3',
          'RDATE:20260701T090000Z',
        ],
      ]),
    ).toBe('2026-07-01T10:00');
    expect(
      span([
        [
          'UID:a',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=DAILY;COUNT=3',
        ],
        [
          'UID:a',
          'RECURRENCE-ID:20260603T090000Z',
          'DTSTART:20260720T090000Z',
          'DTEND:20260720T100000Z',
        ],
      ]),
    ).toBe('2026-07-20T10:00');
  });

  it('is the latest override end for an object of overrides only', () => {
    expect(
      span([
        [
          'UID:a',
          'RECURRENCE-ID:20260603T090000Z',
          'DTSTART:20260603T110000Z',
          'DTEND:20260603T120000Z',
        ],
        [
          'UID:a',
          'RECURRENCE-ID:20260605T090000Z',
          'DTSTART:20260605T080000Z',
          'DTEND:20260605T090000Z',
        ],
      ]),
    ).toBe('2026-06-05T09:00');
  });

  it('is null for an unbounded series even with an override, and a bounded one stays bounded', () => {
    expect(
      span([
        ['UID:a', 'DTSTART:20260601T090000Z', 'RRULE:FREQ=DAILY'],
        ['UID:a', 'RECURRENCE-ID:20260603T090000Z', 'DTSTART:20260604T090000Z'],
      ]),
    ).toBeNull();
  });

  it('gives an all-day event the end of its last day (exclusive)', () => {
    expect(
      span([
        ['UID:d', 'DTSTART;VALUE=DATE:20260924', 'RRULE:FREQ=DAILY;COUNT=3'],
      ]),
    ).toBe('2026-09-27T00:00');
  });

  it('respects the zone: a TZID series ends at the local time of its last instance', () => {
    // Last of 5 daily 09:00-10:00 Berlin instances is Oct 27 (CET): 10:00 CET = 09:00Z.
    expect(
      span(
        [
          [
            'UID:t',
            'DTSTART;TZID=Europe/Berlin:20261023T090000',
            'DTEND;TZID=Europe/Berlin:20261023T100000',
            'RRULE:FREQ=DAILY;COUNT=5',
          ],
        ],
        BERLIN_VTIMEZONE,
      ),
    ).toBe('2026-10-27T09:00');
  });

  it('reads floating times as UTC by default and in the given zone when asked', () => {
    const parsed = object([
      ['UID:f', 'DTSTART:20260715T090000', 'DTEND:20260715T100000'],
    ]);

    expect(computeRecurrenceSpanEnd(parsed)?.toISOString()).toBe(
      '2026-07-15T10:00:00.000Z',
    );
    expect(
      computeRecurrenceSpanEnd(parsed, {
        floatingTimeZone: 'Europe/Berlin',
      })?.toISOString(),
    ).toBe('2026-07-15T08:00:00.000Z');
  });

  it('does not spin on a hostile COUNT: treats it as unbounded, quickly', () => {
    const started = Date.now();

    expect(
      span([
        [
          'UID:h',
          'DTSTART:20200101T000000Z',
          'RRULE:FREQ=SECONDLY;COUNT=999999999',
        ],
      ]),
    ).toBeNull();
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('bounds a hostile UNTIL rule by UNTIL (plus one instance) instead of walking it', () => {
    const started = Date.now();

    const end = span([
      [
        'UID:h',
        'DTSTART:20200101T000000Z',
        'DTEND:20200101T010000Z',
        'RRULE:FREQ=SECONDLY;UNTIL=20991231T000000Z',
      ],
    ]);

    expect(end).not.toBeNull();
    expect(end! >= '2099-12-31T01:00').toBe(true);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('never yields an invalid date, even when every instance is excluded', () => {
    const end = computeRecurrenceSpanEnd(
      object([
        [
          'UID:a',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'EXDATE:20260601T090000Z',
        ],
      ]),
    );

    expect(end?.toISOString()).toBe('2026-06-01T10:00:00.000Z');
  });
});
