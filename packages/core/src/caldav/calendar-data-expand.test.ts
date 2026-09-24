import { describe, expect, it } from 'vitest';
import { parseCalendarObject } from './icalendar-parser.js';
import { renderExpandedCalendarData } from './calendar-data-expand.js';
import { RecurrenceLimitError } from './expand-recurrence.js';

function lines(text: string): string[] {
  return text.split('\r\n');
}

function veventBlocks(text: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines(text)) {
    if (line === 'BEGIN:VEVENT') {
      current = [];
    } else if (line === 'END:VEVENT') {
      if (current) {
        blocks.push(current);
      }
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  return blocks;
}

describe('renderExpandedCalendarData', () => {
  it('is CRLF-separated, wrapped in one VCALENDAR/VERSION:2.0, with no leftover VTIMEZONE', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260924T100000Z',
      'DTEND:20260924T110000Z',
      'SUMMARY:Meeting',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const parsed = parseCalendarObject(ics);

    const out = renderExpandedCalendarData(
      ics,
      parsed,
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z'),
      null,
    );

    expect(out).toContain('\r\n');
    expect(out).not.toContain('\n\n');
    expect(out.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0')).toBe(true);
    expect(out).toContain('END:VCALENDAR');
    expect(out).not.toContain('VTIMEZONE');
  });

  it('a single non-recurring event carries a RECURRENCE-ID equal to its own DTSTART', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260924T100000Z',
      'DTEND:20260924T110000Z',
      'SUMMARY:Meeting',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const parsed = parseCalendarObject(ics);

    const out = renderExpandedCalendarData(
      ics,
      parsed,
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z'),
      null,
    );

    const [block] = veventBlocks(out);
    expect(block).toContain('DTSTART:20260924T100000Z');
    expect(block).toContain('DTEND:20260924T110000Z');
    expect(block).toContain('RECURRENCE-ID:20260924T100000Z');
    expect(block).toContain('SUMMARY:Meeting');
    expect(block).toContain('UID:1');
  });

  it('a weekly series with an override yields one VEVENT per instance, none carrying RRULE, all carrying RECURRENCE-ID', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:series-1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260105T090000Z',
      'DTEND:20260105T100000Z',
      'RRULE:FREQ=WEEKLY;COUNT=4',
      'SUMMARY:Standup',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:series-1',
      'DTSTAMP:20260101T000000Z',
      'RECURRENCE-ID:20260112T090000Z',
      'DTSTART:20260112T140000Z',
      'DTEND:20260112T150000Z',
      'SUMMARY:Standup (moved)',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const parsed = parseCalendarObject(ics);

    const out = renderExpandedCalendarData(
      ics,
      parsed,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-02-01T00:00:00Z'),
      null,
    );

    const blocks = veventBlocks(out);
    expect(blocks).toHaveLength(4);
    expect(
      blocks.every((block) => !block.some((line) => line.startsWith('RRULE'))),
    ).toBe(true);
    expect(
      blocks.every((block) =>
        block.some((line) => line.startsWith('RECURRENCE-ID:')),
      ),
    ).toBe(true);
    expect(
      blocks
        .map((b) => b.find((l) => l.startsWith('UID')))
        .every((l) => l === 'UID:series-1'),
    ).toBe(true);

    // The moved instance: RECURRENCE-ID at its original slot, DTSTART/DTEND at the new time.
    const moved = blocks.find((b) => b.includes('SUMMARY:Standup (moved)'));
    expect(moved).toContain('RECURRENCE-ID:20260112T090000Z');
    expect(moved).toContain('DTSTART:20260112T140000Z');
    expect(moved).toContain('DTEND:20260112T150000Z');

    // The other three keep the master's own SUMMARY at their own (unmoved) slots.
    const unmoved = blocks.filter((b) => b.includes('SUMMARY:Standup'));
    expect(unmoved).toHaveLength(3);
    expect(unmoved.map((b) => b.find((l) => l.startsWith('DTSTART')))).toEqual([
      'DTSTART:20260105T090000Z',
      'DTSTART:20260119T090000Z',
      'DTSTART:20260126T090000Z',
    ]);
  });

  it('honours EXDATE: the excluded instance is not rendered', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260105T090000Z',
      'DTEND:20260105T100000Z',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'EXDATE:20260112T090000Z',
      'SUMMARY:Standup',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const parsed = parseCalendarObject(ics);

    const out = renderExpandedCalendarData(
      ics,
      parsed,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-02-01T00:00:00Z'),
      null,
    );

    const starts = veventBlocks(out).map((b) =>
      b.find((l) => l.startsWith('DTSTART')),
    );
    expect(starts).toEqual([
      'DTSTART:20260105T090000Z',
      'DTSTART:20260119T090000Z',
    ]);
  });

  it('renders an all-day event as a plain DATE, not a UTC DATE-TIME', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART;VALUE=DATE:20260924',
      'RRULE:FREQ=DAILY;COUNT=2',
      'SUMMARY:Holiday',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const parsed = parseCalendarObject(ics);

    const out = renderExpandedCalendarData(
      ics,
      parsed,
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z'),
      null,
    );

    const blocks = veventBlocks(out);
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.some((l) => /^DTSTART;VALUE=DATE:\d{8}$/.test(l))).toBe(
        true,
      );
      expect(block.some((l) => /^DTEND;VALUE=DATE:\d{8}$/.test(l))).toBe(true);
      expect(
        block.some((l) => /^RECURRENCE-ID;VALUE=DATE:\d{8}$/.test(l)),
      ).toBe(true);
      expect(
        block.some((l) => !l.startsWith('DTSTAMP') && l.includes('Z')),
      ).toBe(false);
    }
  });

  it('resolves a floating DTSTART using the given zone, converting it to UTC', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260924T100000',
      'DTEND:20260924T110000',
      'SUMMARY:Floating',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const parsed = parseCalendarObject(ics);

    const out = renderExpandedCalendarData(
      ics,
      parsed,
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z'),
      'Europe/Berlin',
    );

    // 10:00 CEST (UTC+2) on 2026-09-24 is 08:00 UTC.
    expect(veventBlocks(out)[0]).toContain('DTSTART:20260924T080000Z');
  });

  it('keeps every other property unchanged (ATTENDEE, LOCATION, custom X- properties)', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260924T100000Z',
      'DTEND:20260924T110000Z',
      'SUMMARY:Meeting',
      'LOCATION:Room 1',
      'ATTENDEE;PARTSTAT=ACCEPTED:mailto:alice@example.com',
      'X-CUSTOM:value',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const parsed = parseCalendarObject(ics);

    const out = renderExpandedCalendarData(
      ics,
      parsed,
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z'),
      null,
    );

    expect(out).toContain('LOCATION:Room 1');
    expect(out).toContain(
      'ATTENDEE;PARTSTAT=ACCEPTED:mailto:alice@example.com',
    );
    expect(out).toContain('X-CUSTOM:value');
  });

  it('returns no VEVENT when nothing overlaps the range', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260924T100000Z',
      'DTEND:20260924T110000Z',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const parsed = parseCalendarObject(ics);

    const out = renderExpandedCalendarData(
      ics,
      parsed,
      new Date('2027-01-01T00:00:00Z'),
      new Date('2027-02-01T00:00:00Z'),
      null,
    );

    expect(veventBlocks(out)).toHaveLength(0);
    expect(out).toContain('BEGIN:VCALENDAR');
    expect(out).toContain('END:VCALENDAR');
  });

  it('propagates RecurrenceLimitError for a rule too large to walk within the given cap', () => {
    const ics = [
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
      '',
    ].join('\r\n');
    const parsed = parseCalendarObject(ics);

    expect(() =>
      renderExpandedCalendarData(
        ics,
        parsed,
        new Date('2099-01-01T00:00:00Z'),
        new Date('2099-01-02T00:00:00Z'),
        null,
      ),
    ).toThrow(RecurrenceLimitError);
  });

  it('an object of overrides only (no master) renders exactly those overrides', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20260101T000000Z',
      'RECURRENCE-ID:20260924T100000Z',
      'DTSTART:20260924T100000Z',
      'DTEND:20260924T110000Z',
      'SUMMARY:Lone override',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const parsed = parseCalendarObject(ics);

    const out = renderExpandedCalendarData(
      ics,
      parsed,
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z'),
      null,
    );

    const blocks = veventBlocks(out);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('SUMMARY:Lone override');
  });
});
