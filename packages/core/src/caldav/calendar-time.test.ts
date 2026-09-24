import { afterEach, describe, expect, it } from 'vitest';
import {
  addWallDays,
  durationMillis,
  endMs,
  startMs,
  toIcalTime,
  toInstantMs,
  type TimeResolution,
} from './calendar-time.js';
import { ZoneRegistry } from './calendar-zones.js';
import {
  parseCalendarObject,
  type CalendarTime,
  type ParsedComponent,
} from './icalendar-parser.js';

const resolution = (
  floatingTimeZone: string | null = null,
): TimeResolution => ({
  zones: new ZoneRegistry(),
  floatingTimeZone,
});

const time = (
  kind: CalendarTime['kind'],
  fields: [number, number, number, number?, number?, number?],
  tzid: string | null = null,
): CalendarTime => ({
  kind,
  year: fields[0],
  month: fields[1],
  day: fields[2],
  hour: fields[3] ?? 0,
  minute: fields[4] ?? 0,
  second: fields[5] ?? 0,
  tzid,
});

function component(
  overrides: Partial<ParsedComponent> & Pick<ParsedComponent, 'dtstart'>,
): ParsedComponent {
  return {
    dtend: null,
    duration: null,
    isAllDay: overrides.dtstart.kind === 'date',
    rrule: null,
    rdate: [],
    exdate: [],
    recurrenceId: null,
    transparency: 'opaque',
    status: null,
    summary: null,
    ...overrides,
  };
}

describe('toInstantMs', () => {
  it('reads UTC times as written', () => {
    expect(toInstantMs(time('utc', [2026, 9, 24, 10]), resolution())).toBe(
      Date.UTC(2026, 8, 24, 10),
    );
  });

  it('reads zoned times through their zone, across daylight saving', () => {
    const berlin = (month: number) =>
      toInstantMs(
        time('zoned', [2026, month, 15, 9], 'Europe/Berlin'),
        resolution(),
      );

    expect(berlin(7)).toBe(Date.UTC(2026, 6, 15, 7));
    expect(berlin(12)).toBe(Date.UTC(2026, 11, 15, 8));
  });

  it('reads floating times and dates as UTC by default, or in the chosen floating zone', () => {
    const floating = time('floating', [2026, 7, 15, 9]);
    const date = time('date', [2026, 7, 15]);

    expect(toInstantMs(floating, resolution())).toBe(Date.UTC(2026, 6, 15, 9));
    expect(toInstantMs(date, resolution())).toBe(Date.UTC(2026, 6, 15));
    expect(toInstantMs(floating, resolution('Europe/Berlin'))).toBe(
      Date.UTC(2026, 6, 15, 7),
    );
    expect(toInstantMs(date, resolution('America/New_York'))).toBe(
      Date.UTC(2026, 6, 15, 4),
    );
  });
});

describe('startMs / endMs (the effective DTEND, RFC 4791 §9.9)', () => {
  const R = resolution();

  it('uses DTEND when there is one', () => {
    const c = component({
      dtstart: time('utc', [2026, 9, 24, 10]),
      dtend: time('utc', [2026, 9, 24, 11, 30]),
    });

    expect(startMs(c, R)).toBe(Date.UTC(2026, 8, 24, 10));
    expect(endMs(c, R)).toBe(Date.UTC(2026, 8, 24, 11, 30));
  });

  it('adds DURATION to the start when there is no DTEND', () => {
    const c = component({
      dtstart: time('utc', [2026, 9, 24, 10]),
      duration: 'PT1H30M',
    });

    expect(endMs(c, R)).toBe(Date.UTC(2026, 8, 24, 11, 30));
  });

  it('gives a DATE event with neither a length of one day, and a DATE-TIME event zero length', () => {
    expect(endMs(component({ dtstart: time('date', [2026, 9, 24]) }), R)).toBe(
      Date.UTC(2026, 8, 25),
    );
    expect(endMs(component({ dtstart: time('date', [2026, 12, 31]) }), R)).toBe(
      Date.UTC(2027, 0, 1),
    );
    const zeroLength = component({ dtstart: time('utc', [2026, 9, 24, 10]) });
    expect(endMs(zeroLength, R)).toBe(startMs(zeroLength, R));
  });

  it('honours a multi-day all-day event (exclusive DATE end)', () => {
    const c = component({
      dtstart: time('date', [2026, 9, 24]),
      dtend: time('date', [2026, 9, 27]),
    });

    expect(endMs(c, R) - startMs(c, R)).toBe(3 * 86_400_000);
  });
});

describe('addWallDays and durationMillis', () => {
  it('moves a date across month and year boundaries, keeping kind and zone', () => {
    expect(addWallDays(time('date', [2026, 2, 28]), 1)).toMatchObject({
      year: 2026,
      month: 3,
      day: 1,
      kind: 'date',
    });
    expect(
      addWallDays(time('zoned', [2026, 12, 31, 9], 'Europe/Berlin'), 1),
    ).toMatchObject({
      year: 2027,
      month: 1,
      day: 1,
      hour: 9,
      tzid: 'Europe/Berlin',
      kind: 'zoned',
    });
  });

  it('measures durations, a day as 24 hours and a week as seven days', () => {
    expect(durationMillis('PT1H30M')).toBe(5_400_000);
    expect(durationMillis('P1D')).toBe(86_400_000);
    expect(durationMillis('P1W')).toBe(7 * 86_400_000);
    expect(durationMillis('P1DT2H')).toBe(26 * 3_600_000);
  });
});

describe('toIcalTime', () => {
  it('attaches the right zone so the iterator computes in it', () => {
    const utc = toIcalTime(time('utc', [2026, 9, 24, 10]), resolution());
    const berlin = toIcalTime(
      time('zoned', [2026, 9, 24, 10], 'Europe/Berlin'),
      resolution(),
    );
    const floating = toIcalTime(
      time('floating', [2026, 9, 24, 10]),
      resolution(),
    );
    const date = toIcalTime(time('date', [2026, 9, 24]), resolution());

    expect(utc.zone.tzid).toBe('UTC');
    expect(berlin.zone.tzid).toBe('Europe/Berlin');
    expect(floating.zone.tzid).toBe('floating');
    expect(date.isDate).toBe(true);
  });
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

  const text = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//t//EN',
    'BEGIN:VEVENT',
    'UID:tz',
    'DTSTART;TZID=Europe/Berlin:20261025T023000',
    'DTEND:20261025T120000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:tz',
    'RECURRENCE-ID;VALUE=DATE:20261026',
    'DTSTART;VALUE=DATE:20261026',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  function instants(): number[] {
    const parsed = parseCalendarObject(text);
    const floating = [null, 'America/Los_Angeles'];
    return [parsed.master!, parsed.overrides[0]!].flatMap((c) =>
      floating.flatMap((zone) => [
        startMs(c, resolution(zone)),
        endMs(c, resolution(zone)),
      ]),
    );
  }

  it('gives the same instants under every process TZ — floating times must not follow the server clock', () => {
    const results = [
      'UTC',
      'Europe/Berlin',
      'America/Los_Angeles',
      'Asia/Kolkata',
      'Pacific/Auckland',
    ].map((tz) => {
      process.env.TZ = tz;
      return JSON.stringify(instants());
    });

    expect(new Set(results).size).toBe(1);
  });
});
