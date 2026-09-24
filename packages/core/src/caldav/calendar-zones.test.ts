import { describe, expect, it } from 'vitest';
import {
  UnknownTimezoneError,
  ZoneRegistry,
  utcMillis,
} from './calendar-zones.js';

const CUSTOM_VTIMEZONE = `BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:STANDARD
TZOFFSETFROM:+0500
TZOFFSETTO:+0500
TZNAME:CUSTOM
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE`.replace(/\n/g, '\r\n');

const clock = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
) => ({ year, month, day, hour, minute, second: 0 });

describe('utcMillis', () => {
  it('matches Date.UTC, also for years below 100 where Date.UTC would add 1900', () => {
    expect(utcMillis(clock(2026, 9, 24, 10, 30))).toBe(
      Date.UTC(2026, 8, 24, 10, 30),
    );
    expect(new Date(utcMillis(clock(99, 1, 1, 0))).getUTCFullYear()).toBe(99);
  });
});

describe('ZoneRegistry', () => {
  it('resolves an IANA zone through Intl, with daylight saving', () => {
    const zones = new ZoneRegistry();

    expect(zones.offsetSeconds('Europe/Berlin', clock(2026, 7, 1, 12))).toBe(
      7200,
    );
    expect(zones.offsetSeconds('Europe/Berlin', clock(2026, 12, 1, 12))).toBe(
      3600,
    );
    expect(zones.offsetSeconds('America/New_York', clock(2026, 7, 1, 12))).toBe(
      -4 * 3600,
    );
    expect(zones.offsetSeconds('Asia/Kolkata', clock(2026, 7, 1, 12))).toBe(
      19800,
    );
  });

  it('resolves a skipped wall-clock time with the offset in force before the change (RFC 5545 §3.3.5)', () => {
    const zones = new ZoneRegistry();

    // Europe/Berlin springs forward 02:00 -> 03:00 on 2026-03-29: 02:30 does not exist.
    expect(
      zones.offsetSeconds('Europe/Berlin', clock(2026, 3, 29, 2, 30)),
    ).toBe(3600);
    expect(
      zones.offsetSeconds('Europe/Berlin', clock(2026, 3, 29, 1, 59)),
    ).toBe(3600);
    expect(zones.offsetSeconds('Europe/Berlin', clock(2026, 3, 29, 3, 0))).toBe(
      7200,
    );
  });

  it('resolves a repeated wall-clock time as its first occurrence (RFC 5545 §3.3.5)', () => {
    const zones = new ZoneRegistry();

    // Berlin falls back 03:00 -> 02:00 on 2026-10-25: 02:30 happens twice; the first is still CEST.
    expect(
      zones.offsetSeconds('Europe/Berlin', clock(2026, 10, 25, 2, 30)),
    ).toBe(7200);
    expect(
      zones.offsetSeconds('Europe/Berlin', clock(2026, 10, 25, 3, 30)),
    ).toBe(3600);
    expect(
      zones.offsetSeconds('America/New_York', clock(2026, 11, 1, 1, 30)),
    ).toBe(-4 * 3600);
  });

  it('prefers a VTIMEZONE the object carries over the IANA zone of the same name', () => {
    const zones = new ZoneRegistry([
      { tzid: 'Europe/Berlin', vtimezone: CUSTOM_VTIMEZONE },
    ]);

    expect(zones.offsetSeconds('Europe/Berlin', clock(2026, 7, 1, 12))).toBe(
      5 * 3600,
    );
    expect(zones.offsetSeconds('Europe/Berlin', clock(2026, 12, 1, 12))).toBe(
      5 * 3600,
    );
  });

  it('evaluates the daylight-saving rules of a carried VTIMEZONE', () => {
    const zones = new ZoneRegistry([
      {
        tzid: 'Custom/Zone',
        vtimezone: `BEGIN:VTIMEZONE
TZID:Custom/Zone
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`.replace(/\n/g, '\r\n'),
      },
    ]);

    expect(zones.offsetSeconds('Custom/Zone', clock(2026, 7, 1, 12))).toBe(
      7200,
    );
    expect(zones.offsetSeconds('Custom/Zone', clock(2026, 12, 1, 12))).toBe(
      3600,
    );
  });

  it('throws UnknownTimezoneError, naming the TZID, for a zone nothing defines', () => {
    const zones = new ZoneRegistry();

    expect(() => zones.get('Nowhere/Land')).toThrow(UnknownTimezoneError);
    expect(() => zones.get('W. Europe Standard Time')).toThrow(
      /"W\. Europe Standard Time"/,
    );
  });

  it('keeps registries independent: a definition in one object never leaks into another', () => {
    const custom = new ZoneRegistry([
      { tzid: 'Europe/Berlin', vtimezone: CUSTOM_VTIMEZONE },
    ]);
    const plain = new ZoneRegistry();

    expect(custom.offsetSeconds('Europe/Berlin', clock(2026, 7, 1, 12))).toBe(
      5 * 3600,
    );
    expect(plain.offsetSeconds('Europe/Berlin', clock(2026, 7, 1, 12))).toBe(
      7200,
    );
  });
});

/** The daylight-saving rules of four zones as a `VTIMEZONE` would carry them, each with the IANA name to check against. */
const RULE_ZONES = [
  {
    tzid: 'Europe/Berlin',
    // Last Sunday of March / October, 1 hour.
    vtimezone: `BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`,
  },
  {
    tzid: 'America/New_York',
    // Second Sunday of March / first of November, 1 hour, west of UTC.
    vtimezone: `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`,
  },
  {
    tzid: 'Australia/Sydney',
    // Southern hemisphere: daylight time in the first months of the year.
    vtimezone: `BEGIN:VTIMEZONE
TZID:Australia/Sydney
BEGIN:DAYLIGHT
TZOFFSETFROM:+1000
TZOFFSETTO:+1100
DTSTART:19701004T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+1100
TZOFFSETTO:+1000
DTSTART:19700405T030000
RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`,
  },
  {
    tzid: 'Australia/Lord_Howe',
    // The change is only half an hour.
    vtimezone: `BEGIN:VTIMEZONE
TZID:Australia/Lord_Howe
BEGIN:DAYLIGHT
TZOFFSETFROM:+1030
TZOFFSETTO:+1100
DTSTART:19701004T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+1100
TZOFFSETTO:+1030
DTSTART:19700405T020000
RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`,
  },
].map(({ tzid, vtimezone }) => ({
  tzid,
  vtimezone: vtimezone.replace(/\n/g, '\r\n'),
}));

describe('ZoneRegistry with a carried VTIMEZONE', () => {
  it('resolves a skipped and a repeated wall-clock time like RFC 5545 §3.3.5, for Berlin', () => {
    const zones = new ZoneRegistry([RULE_ZONES[0]]);

    // Skipped: 02:30 on 2026-03-29 doesn't exist; the offset before the change (CET) applies.
    expect(
      zones.offsetSeconds('Europe/Berlin', clock(2026, 3, 29, 1, 59)),
    ).toBe(3600);
    expect(zones.offsetSeconds('Europe/Berlin', clock(2026, 3, 29, 2, 0))).toBe(
      3600,
    );
    expect(
      zones.offsetSeconds('Europe/Berlin', clock(2026, 3, 29, 2, 30)),
    ).toBe(3600);
    expect(zones.offsetSeconds('Europe/Berlin', clock(2026, 3, 29, 3, 0))).toBe(
      7200,
    );
    // Repeated: 02:30 on 2026-10-25 happens twice; the first occurrence (CEST) applies.
    expect(
      zones.offsetSeconds('Europe/Berlin', clock(2026, 10, 25, 1, 59)),
    ).toBe(7200);
    expect(
      zones.offsetSeconds('Europe/Berlin', clock(2026, 10, 25, 2, 30)),
    ).toBe(7200);
    expect(
      zones.offsetSeconds('Europe/Berlin', clock(2026, 10, 25, 2, 59)),
    ).toBe(7200);
    expect(
      zones.offsetSeconds('Europe/Berlin', clock(2026, 10, 25, 3, 0)),
    ).toBe(3600);
  });

  it.each(RULE_ZONES.map((zone) => [zone.tzid, zone] as const))(
    'agrees with the IANA database for %s at every quarter hour around every change in 2026 and 2027',
    (_tzid, zone) => {
      const carried = new ZoneRegistry([zone]);
      const iana = new ZoneRegistry();

      // Every quarter hour of the two years would be 70 000 checks; the
      // interesting ones lie within two days of a change, found by scanning
      // the days for an offset that differs from the day before.
      const day = 86_400_000;
      const start = Date.UTC(2026, 0, 1);
      const days = 2 * 365;
      const dayOffsets = Array.from({ length: days + 1 }, (_, index) =>
        iana.offsetSeconds(zone.tzid, {
          ...wallClockAt(start + index * day + 12 * 3_600_000),
        }),
      );
      const checked: number[] = [];
      for (let index = 1; index <= days; index += 1) {
        if (dayOffsets[index] !== dayOffsets[index - 1]) {
          for (
            let ms = start + (index - 2) * day;
            ms < start + (index + 2) * day;
            ms += 15 * 60_000
          ) {
            checked.push(ms);
          }
        }
      }
      // A coarser sweep of the whole span, off the changes.
      for (let ms = start; ms < start + days * day; ms += 6 * 3_600_000) {
        checked.push(ms);
      }

      expect(checked.length).toBeGreaterThan(400);
      for (const ms of checked) {
        const wall = wallClockAt(ms);
        expect(
          carried.offsetSeconds(zone.tzid, wall),
          `${zone.tzid} ${new Date(ms).toISOString()} read as wall clock`,
        ).toBe(iana.offsetSeconds(zone.tzid, wall));
      }
    },
    30_000,
  );

  it('stays fast enough to place thousands of instances of a recurring event', () => {
    const zones = new ZoneRegistry([RULE_ZONES[0]]);
    const started = performance.now();

    for (let index = 0; index < 20_000; index += 1) {
      zones.offsetSeconds('Europe/Berlin', {
        ...wallClockAt(Date.UTC(2026, 0, 1) + index * 86_400_000),
      });
    }

    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

/** The wall-clock fields of the UTC instant `ms`, read as wall-clock time. */
function wallClockAt(ms: number) {
  const date = new Date(ms);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}
