import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../api/client';
import {
  eventDayKeys,
  formatTimeRange,
  formatWhen,
  groupByDay,
} from './events';

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  objectId: '00000000-0000-4000-8000-000000000093',
  uid: '00000000-0000-4000-8000-0000000000a1',
  name: 'e.ics',
  summary: 'Standup',
  location: null,
  description: null,
  start: '2026-10-26T09:00:00.000Z',
  end: '2026-10-26T10:00:00.000Z',
  isAllDay: false,
  isRecurring: false,
  isOverride: false,
  status: null,
  transparency: 'opaque',
  ...over,
});

describe('eventDayKeys', () => {
  it('is the one day of a short event', () => {
    expect(eventDayKeys(event())).toEqual(['2026-10-26']);
  });

  it('spreads a multi-day event over every day it touches', () => {
    expect(
      eventDayKeys(
        event({
          start: '2026-10-26T22:00:00.000Z',
          end: '2026-10-28T01:00:00.000Z',
        }),
      ),
    ).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
  });

  it('does not spill an event that ends exactly at midnight onto the next day', () => {
    expect(
      eventDayKeys(
        event({
          start: '2026-10-26T20:00:00.000Z',
          end: '2026-10-27T00:00:00.000Z',
        }),
      ),
    ).toEqual(['2026-10-26']);
  });

  it('keeps an all-day event on its date (end exclusive)', () => {
    expect(
      eventDayKeys(
        event({
          isAllDay: true,
          start: '2026-10-26T00:00:00.000Z',
          end: '2026-10-27T00:00:00.000Z',
        }),
      ),
    ).toEqual(['2026-10-26']);
  });

  it('keeps a multi-day all-day event on its dates', () => {
    expect(
      eventDayKeys(
        event({
          isAllDay: true,
          start: '2026-12-24T00:00:00.000Z',
          end: '2026-12-27T00:00:00.000Z',
        }),
      ),
    ).toEqual(['2026-12-24', '2026-12-25', '2026-12-26']);
  });

  it('shows an event without length on its day', () => {
    expect(eventDayKeys(event({ end: '2026-10-26T09:00:00.000Z' }))).toEqual([
      '2026-10-26',
    ]);
  });

  it('caps the days of an absurdly long event', () => {
    expect(
      eventDayKeys(
        event({ start: '2020-01-01T00:00:00Z', end: '2030-01-01T00:00:00Z' }),
      ),
    ).toHaveLength(62);
  });
});

describe('groupByDay', () => {
  it('collects the events of each day', () => {
    const a = event({ objectId: 'a' });
    const b = event({
      objectId: 'b',
      start: '2026-10-26T12:00:00Z',
      end: '2026-10-27T12:00:00Z',
    });

    const days = groupByDay([a, b]);

    expect(days.get('2026-10-26')?.map((e) => e.objectId)).toEqual(['a', 'b']);
    expect(days.get('2026-10-27')?.map((e) => e.objectId)).toEqual(['b']);
    expect(days.has('2026-10-28')).toBe(false);
  });
});

describe('formatTimeRange', () => {
  it('formats start and end', () => {
    expect(formatTimeRange(event(), 'en-GB')).toBe('9:00 – 10:00');
  });

  it('is empty for an all-day event', () => {
    expect(formatTimeRange(event({ isAllDay: true }), 'en-GB')).toBe('');
  });

  it('marks the open side on the days in between', () => {
    const multi = event({
      start: '2026-10-26T22:00:00Z',
      end: '2026-10-28T01:00:00Z',
    });

    expect(formatTimeRange(multi, 'en-GB', '2026-10-26')).toBe('22:00 – …');
    expect(formatTimeRange(multi, 'en-GB', '2026-10-27')).toBe('');
    expect(formatTimeRange(multi, 'en-GB', '2026-10-28')).toBe('… – 1:00');
  });
});

describe('formatWhen', () => {
  it('names the date and the times', () => {
    expect(formatWhen(event(), 'en-GB')).toBe('Mon, 26 Oct 2026, 9:00 – 10:00');
  });

  it('names just the date for an all-day event', () => {
    expect(
      formatWhen(
        event({
          isAllDay: true,
          start: '2026-10-26T00:00:00Z',
          end: '2026-10-27T00:00:00Z',
        }),
        'en-GB',
      ),
    ).toBe('Mon, 26 Oct 2026');
  });

  it('names the first and the last day of a multi-day all-day event', () => {
    expect(
      formatWhen(
        event({
          isAllDay: true,
          start: '2026-12-24T00:00:00Z',
          end: '2026-12-27T00:00:00Z',
        }),
        'en-GB',
      ),
    ).toBe('Thu, 24 Dec 2026 – Sat, 26 Dec 2026');
  });
});
