import { describe, expect, it } from 'vitest';
import {
  matchesPropFilters,
  matchesTimeRange,
} from './calendar-query-report.js';
import { parseCalendarObject } from './icalendar-parser.js';
import { RecurrenceLimitError } from './expand-recurrence.js';
import type { CalendarPropFilter } from './calendar-query-request.js';

function parse(lines: string[]) {
  return parseCalendarObject(lines.join('\r\n') + '\r\n');
}

const ONE_OFF = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//x//EN',
  'BEGIN:VEVENT',
  'UID:1',
  'DTSTAMP:20260101T000000Z',
  'DTSTART:20260924T100000Z',
  'DTEND:20260924T110000Z',
  'SUMMARY:Team Standup',
  'END:VEVENT',
  'END:VCALENDAR',
];

const WEEKLY_SERIES = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//x//EN',
  'BEGIN:VEVENT',
  'UID:series-1',
  'DTSTAMP:20260101T000000Z',
  'DTSTART:20260101T090000Z',
  'DTEND:20260101T100000Z',
  'RRULE:FREQ=WEEKLY;COUNT=20',
  'SUMMARY:Standup',
  'END:VEVENT',
  'END:VCALENDAR',
];

describe('matchesTimeRange', () => {
  it('null (no time-range) always matches', () => {
    expect(matchesTimeRange(parse(ONE_OFF), null, null)).toBe(true);
  });

  it('finds a one-off event whose own time overlaps the range', () => {
    expect(
      matchesTimeRange(
        parse(ONE_OFF),
        {
          start: new Date('2026-09-24T09:00:00Z'),
          end: new Date('2026-09-24T12:00:00Z'),
        },
        null,
      ),
    ).toBe(true);
  });

  it('does not find a one-off event outside the range', () => {
    expect(
      matchesTimeRange(
        parse(ONE_OFF),
        {
          start: new Date('2026-09-25T00:00:00Z'),
          end: new Date('2026-09-26T00:00:00Z'),
        },
        null,
      ),
    ).toBe(false);
  });

  it('finds a recurring event whose NEXT instance is in range, even though DTSTART is far earlier', () => {
    // The first instance is 2026-01-01; a range around the 10th occurrence (~9 weeks later).
    expect(
      matchesTimeRange(
        parse(WEEKLY_SERIES),
        {
          start: new Date('2026-03-01T00:00:00Z'),
          end: new Date('2026-03-08T00:00:00Z'),
        },
        null,
      ),
    ).toBe(true);
  });

  it('does not find a recurring event whose span overlaps the range but has no actual instance in it', () => {
    // Weekly on Thursdays (2026-01-01 is a Thursday); a range covering only the following
    // Saturday/Sunday has no instance, even though it lies well inside the series' overall span.
    expect(
      matchesTimeRange(
        parse(WEEKLY_SERIES),
        {
          start: new Date('2026-03-07T00:00:00Z'),
          end: new Date('2026-03-08T00:00:00Z'),
        },
        null,
      ),
    ).toBe(false);
  });

  it('an EXDATE-excluded occurrence is not a match when it is the only one in range', () => {
    const series = [
      ...WEEKLY_SERIES.slice(0, -2),
      'EXDATE:20260108T090000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    expect(
      matchesTimeRange(
        parse(series),
        {
          start: new Date('2026-01-08T00:00:00Z'),
          end: new Date('2026-01-09T00:00:00Z'),
        },
        null,
      ),
    ).toBe(false);
    // The instance either side of it is unaffected.
    expect(
      matchesTimeRange(
        parse(series),
        {
          start: new Date('2026-01-01T00:00:00Z'),
          end: new Date('2026-01-02T00:00:00Z'),
        },
        null,
      ),
    ).toBe(true);
  });

  it('propagates RecurrenceLimitError for a rule too large to walk to the range', () => {
    const huge = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260101T100000Z',
      'DTEND:20260101T110000Z',
      'RRULE:FREQ=SECONDLY;COUNT=999999999',
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    expect(() =>
      matchesTimeRange(
        parse(huge),
        {
          start: new Date('2099-01-01T00:00:00Z'),
          end: new Date('2099-01-02T00:00:00Z'),
        },
        null,
      ),
    ).toThrow(RecurrenceLimitError);
  });
});

describe('matchesPropFilters', () => {
  const contains = (value: string): CalendarPropFilter => ({
    name: 'SUMMARY',
    isNotDefined: false,
    textMatch: { value, negate: false, collation: 'i;ascii-casemap' },
  });
  const notDefined: CalendarPropFilter = {
    name: 'SUMMARY',
    isNotDefined: true,
    textMatch: null,
  };

  it('no prop-filters always matches', () => {
    expect(matchesPropFilters(parse(ONE_OFF), [])).toBe(true);
  });

  it('a contains text-match matches on the master SUMMARY', () => {
    expect(matchesPropFilters(parse(ONE_OFF), [contains('Standup')])).toBe(
      true,
    );
    expect(matchesPropFilters(parse(ONE_OFF), [contains('Retro')])).toBe(false);
  });

  it('is-not-defined matches only when there is no SUMMARY', () => {
    const noSummary = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260924T100000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    expect(matchesPropFilters(parse(ONE_OFF), [notDefined])).toBe(false);
    expect(matchesPropFilters(parse(noSummary), [notDefined])).toBe(true);
  });

  it('several prop-filters combine by AND', () => {
    expect(
      matchesPropFilters(parse(ONE_OFF), [
        contains('Team'),
        contains('Standup'),
      ]),
    ).toBe(true);
    expect(
      matchesPropFilters(parse(ONE_OFF), [contains('Team'), contains('Retro')]),
    ).toBe(false);
  });

  it('an object with only overrides (no master) has no SUMMARY to check', () => {
    const overrideOnly = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20260101T000000Z',
      'RECURRENCE-ID:20260924T100000Z',
      'DTSTART:20260924T100000Z',
      'SUMMARY:Only an override',
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    expect(matchesPropFilters(parse(overrideOnly), [contains('Only')])).toBe(
      false,
    );
    expect(matchesPropFilters(parse(overrideOnly), [notDefined])).toBe(true);
  });
});
