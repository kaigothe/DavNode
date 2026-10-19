import { describe, expect, it } from 'vitest';
import { parseCalendarObject } from './icalendar-parser.js';
import { taskMatchesTimeRange } from './task-time.js';

function parse(type: 'VTODO' | 'VJOURNAL', lines: string[]) {
  return parseCalendarObject(
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//t//EN',
      `BEGIN:${type}`,
      'UID:u',
      'DTSTAMP:20260101T000000Z',
      ...lines,
      `END:${type}`,
      'END:VCALENDAR',
      '',
    ].join('\r\n'),
  );
}

const ms = (iso: string): number => Date.parse(iso);
const jun = (day: number, hour = 0): number =>
  ms(
    `2026-06-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`,
  );

function match(
  parsed: ReturnType<typeof parse>,
  start: number | null,
  end: number | null,
): boolean {
  return taskMatchesTimeRange(parsed, start, end, null);
}

describe('taskMatchesTimeRange (RFC 4791 §9.9, VTODO)', () => {
  it('DTSTART + DUE overlaps the range', () => {
    const t = parse('VTODO', [
      'DTSTART:20260610T000000Z',
      'DUE:20260612T000000Z',
    ]);
    expect(match(t, jun(11), jun(13))).toBe(true);
    expect(match(t, jun(12), jun(13))).toBe(false);
    expect(match(t, jun(1), jun(10))).toBe(false);
  });

  it('DTSTART + DURATION uses the computed end', () => {
    const t = parse('VTODO', ['DTSTART:20260610T000000Z', 'DURATION:PT2H']);
    expect(match(t, jun(10, 1), jun(10, 3))).toBe(true);
    expect(match(t, jun(10, 2), jun(10, 3))).toBe(false);
  });

  it('DTSTART alone matches when it lies inside the range', () => {
    const t = parse('VTODO', ['DTSTART:20260610T000000Z']);
    expect(match(t, jun(10), jun(11))).toBe(true);
    expect(match(t, jun(11), jun(12))).toBe(false);
    expect(match(t, jun(9), jun(10))).toBe(false);
  });

  it('DUE alone matches when start < DUE <= end', () => {
    const t = parse('VTODO', ['DUE:20260610T000000Z']);
    expect(match(t, jun(9), jun(10))).toBe(true);
    expect(match(t, jun(10), jun(11))).toBe(false);
    expect(match(t, jun(11), null)).toBe(false);
  });

  it('COMPLETED and CREATED match by either instant', () => {
    const t = parse('VTODO', [
      'CREATED:20260601T000000Z',
      'COMPLETED:20260610T000000Z',
    ]);
    expect(match(t, jun(1), jun(2))).toBe(true);
    expect(match(t, jun(10), jun(11))).toBe(true);
    expect(match(t, jun(20), jun(21))).toBe(false);
  });

  it('CREATED alone matches when the range ends after it', () => {
    const t = parse('VTODO', ['CREATED:20260610T000000Z']);
    expect(match(t, null, jun(11))).toBe(true);
    expect(match(t, null, jun(10))).toBe(false);
  });

  it('a task without any time always matches', () => {
    expect(match(parse('VTODO', ['SUMMARY:x']), jun(1), jun(2))).toBe(true);
  });
});

describe('taskMatchesTimeRange (VJOURNAL)', () => {
  it('matches a DATE-TIME start inside the range only', () => {
    const j = parse('VJOURNAL', ['DTSTART:20260610T100000Z']);
    expect(match(j, jun(10), jun(11))).toBe(true);
    expect(match(j, jun(10, 11), jun(11))).toBe(false);
  });

  it('matches a DATE start for the whole day, and never without DTSTART', () => {
    const day = parse('VJOURNAL', ['DTSTART;VALUE=DATE:20260610']);
    expect(match(day, jun(10, 20), jun(10, 22))).toBe(true);
    expect(match(day, jun(11), jun(12))).toBe(false);
    expect(match(parse('VJOURNAL', ['SUMMARY:x']), jun(1), jun(30))).toBe(
      false,
    );
  });
});

describe('parsing tasks', () => {
  it('rejects DUE together with DURATION and DUE before DTSTART', () => {
    expect(() =>
      parse('VTODO', [
        'DTSTART:20260610T000000Z',
        'DUE:20260611T000000Z',
        'DURATION:PT1H',
      ]),
    ).toThrow(/DUE and DURATION/);
    expect(() =>
      parse('VTODO', ['DTSTART:20260611T000000Z', 'DUE:20260610T000000Z']),
    ).toThrow(/before DTSTART/);
  });

  it('reads the times and summary of the master', () => {
    const t = parse('VTODO', ['SUMMARY:Pay rent', 'DUE;VALUE=DATE:20260701']);
    expect(t.componentType).toBe('VTODO');
    expect(t.master).toBeNull();
    expect(t.task?.summary).toBe('Pay rent');
    expect(t.task?.due?.kind).toBe('date');
  });
});
