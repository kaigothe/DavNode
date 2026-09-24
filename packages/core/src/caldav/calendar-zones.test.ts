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
