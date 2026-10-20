import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  eventsOnDay,
  isSpanning,
  layoutBars,
  layoutTimeColumn,
  localSpan,
  singleDayEvents,
  visibleDays,
  type ViewEvent,
} from './calendarLayout';

let counter = 0;
const event = (over: Partial<ViewEvent> = {}): ViewEvent => {
  counter += 1;
  return {
    key: `e${counter}`,
    calendarId: 'c1',
    calendarName: 'Work',
    color: '#1badf8',
    objectId: `o${counter}`,
    uid: `u${counter}`,
    name: 'e.ics',
    summary: `Event ${counter}`,
    location: null,
    description: null,
    start: '2026-10-14T09:00:00.000Z',
    end: '2026-10-14T10:00:00.000Z',
    isAllDay: false,
    isRecurring: false,
    isOverride: false,
    status: null,
    transparency: 'opaque',
    ...over,
  };
};
const timed = (start: string, end: string, over: Partial<ViewEvent> = {}) =>
  event({
    start: `2026-10-14T${start}:00.000Z`,
    end: `2026-10-14T${end}:00.000Z`,
    ...over,
  });
const allDay = (from: string, to: string) =>
  event({
    isAllDay: true,
    start: `${from}T00:00:00.000Z`,
    end: `${to}T00:00:00.000Z`,
  });

const wednesday = dayjs('2026-10-14T12:00:00Z'); // Wednesday, the test zone is UTC

describe('visibleDays', () => {
  it('is the day itself for the day view', () => {
    expect(
      visibleDays('day', wednesday).map((d) => d.format('YYYY-MM-DD')),
    ).toEqual(['2026-10-14']);
  });

  it('is seven days from the start of the week for the week view', () => {
    const days = visibleDays('week', wednesday);

    expect(days).toHaveLength(7);
    expect(days[0]?.day()).toBe(dayjs().startOf('week').day());
    expect(days.some((d) => d.isSame(wednesday, 'day'))).toBe(true);
  });

  it('pads a month with the days of the weeks it touches', () => {
    const days = visibleDays('month', wednesday);

    expect(days.length % 7).toBe(0);
    expect(days.length).toBeGreaterThanOrEqual(35);
    expect(days[0]?.isAfter(dayjs('2026-09-24'))).toBe(true);
    expect(days.some((d) => d.format('YYYY-MM-DD') === '2026-10-01')).toBe(
      true,
    );
    expect(days.some((d) => d.format('YYYY-MM-DD') === '2026-10-31')).toBe(
      true,
    );
  });

  it('uses as many rows as the month needs (February 2026 fits in four)', () => {
    const february = visibleDays('month', dayjs('2026-02-10'));

    expect(february.length).toBe(28);
  });

  it('adds a sixth row where a month needs it', () => {
    // 1 March 2026 is a Sunday: with Sunday-first weeks March spills into a sixth row.
    expect(visibleDays('month', dayjs('2026-08-10')).length).toBe(42);
  });
});

describe('localSpan and daysBetween', () => {
  it('keeps an all-day event on its dates, end exclusive', () => {
    const span = localSpan(allDay('2026-10-15', '2026-10-18'));

    expect(span.start.format('YYYY-MM-DD')).toBe('2026-10-15');
    expect(span.end.format('YYYY-MM-DD')).toBe('2026-10-18');
  });

  it('gives an all-day event without an end one day', () => {
    const span = localSpan(allDay('2026-10-15', '2026-10-15'));

    expect(daysBetween(span.start, span.end)).toBe(1);
  });

  it('counts whole days', () => {
    expect(
      daysBetween(dayjs('2026-10-14T23:59:00'), dayjs('2026-10-16T00:01:00')),
    ).toBe(2);
    expect(daysBetween(dayjs('2026-10-16'), dayjs('2026-10-14'))).toBe(-2);
  });
});

describe('isSpanning', () => {
  it('is true for all-day events and events that cross midnight', () => {
    expect(isSpanning(allDay('2026-10-15', '2026-10-16'))).toBe(true);
    expect(
      isSpanning(
        event({ start: '2026-10-14T22:00:00Z', end: '2026-10-15T01:00:00Z' }),
      ),
    ).toBe(true);
  });

  it('is false for an event within a day, even one ending at midnight', () => {
    expect(isSpanning(timed('09:00', '10:00'))).toBe(false);
    expect(
      isSpanning(
        event({ start: '2026-10-14T20:00:00Z', end: '2026-10-15T00:00:00Z' }),
      ),
    ).toBe(false);
  });
});

describe('eventsOnDay', () => {
  it('lists all-day events first, then by start time', () => {
    const late = timed('15:00', '16:00');
    const early = timed('08:00', '09:00');
    const whole = allDay('2026-10-14', '2026-10-15');

    expect(eventsOnDay([late, early, whole], wednesday)).toEqual([
      whole,
      early,
      late,
    ]);
  });

  it('includes every day of a multi-day event and not the day after it ends', () => {
    const trip = allDay('2026-10-14', '2026-10-16');

    expect(eventsOnDay([trip], dayjs('2026-10-15'))).toEqual([trip]);
    expect(eventsOnDay([trip], dayjs('2026-10-16'))).toEqual([]);
  });
});

describe('layoutTimeColumn', () => {
  it('places an event at its time with its length', () => {
    const [block] = layoutTimeColumn([timed('09:30', '11:00')], wednesday);

    expect(block).toMatchObject({
      top: 570,
      height: 90,
      column: 0,
      columns: 1,
      before: false,
      after: false,
    });
  });

  it('draws a very short event at a readable minimum height', () => {
    const [block] = layoutTimeColumn([timed('09:00', '09:05')], wednesday);

    expect(block?.height).toBe(20);
  });

  it('puts overlapping events side by side', () => {
    const a = timed('09:00', '10:30');
    const b = timed('10:00', '11:00');

    const blocks = layoutTimeColumn([a, b], wednesday);

    expect(blocks.map((x) => [x.event, x.column, x.columns])).toEqual([
      [a, 0, 2],
      [b, 1, 2],
    ]);
  });

  it('reuses a column once its event is over', () => {
    const a = timed('09:00', '10:00');
    const b = timed('09:30', '11:00');
    const c = timed('10:00', '10:30'); // starts when a ends: takes a's column

    const blocks = layoutTimeColumn([a, b, c], wednesday);

    expect(blocks.map((x) => [x.event, x.column, x.columns])).toEqual([
      [a, 0, 2],
      [b, 1, 2],
      [c, 0, 2],
    ]);
  });

  it('keeps events that merely follow each other in one full-width column', () => {
    const blocks = layoutTimeColumn(
      [timed('09:00', '10:00'), timed('10:00', '11:00')],
      wednesday,
    );

    expect(blocks.map((x) => [x.column, x.columns])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it('shares columns per cluster, not for the whole day', () => {
    const blocks = layoutTimeColumn(
      [
        timed('09:00', '10:00'),
        timed('09:30', '10:30'),
        timed('14:00', '15:00'),
      ],
      wednesday,
    );

    expect(blocks.map((x) => x.columns)).toEqual([2, 2, 1]);
  });

  it('cuts an event that crosses midnight at the edges of each day', () => {
    const night = event({
      start: '2026-10-14T22:00:00Z',
      end: '2026-10-15T02:00:00Z',
    });

    const [first] = layoutTimeColumn([night], wednesday);
    const [second] = layoutTimeColumn([night], dayjs('2026-10-15'));

    expect(first).toMatchObject({
      top: 1320,
      height: 120,
      before: false,
      after: true,
    });
    expect(second).toMatchObject({
      top: 0,
      height: 120,
      before: true,
      after: false,
    });
  });

  it('leaves out all-day events and events of other days', () => {
    const blocks = layoutTimeColumn(
      [
        allDay('2026-10-14', '2026-10-15'),
        event({ start: '2026-10-16T09:00:00Z', end: '2026-10-16T10:00:00Z' }),
      ],
      wednesday,
    );

    expect(blocks).toEqual([]);
  });
});

describe('layoutBars', () => {
  const week = visibleDays('week', wednesday);
  const column = (iso: string) =>
    week.findIndex((d) => d.format('YYYY-MM-DD') === iso);

  it('spans an all-day event over its days', () => {
    const { bars, lanes } = layoutBars(
      [allDay('2026-10-14', '2026-10-17')],
      week,
    );

    expect(lanes).toBe(1);
    expect(bars[0]).toMatchObject({
      startColumn: column('2026-10-14'),
      endColumn: column('2026-10-16'),
      lane: 0,
      before: false,
      after: false,
    });
  });

  it('marks an event that continues from or into the next week', () => {
    const { bars } = layoutBars([allDay('2026-10-01', '2026-10-31')], week);

    expect(bars[0]).toMatchObject({
      startColumn: 0,
      endColumn: 6,
      before: true,
      after: true,
    });
  });

  it('stacks overlapping bars on separate lines and reuses a free line', () => {
    const a = allDay('2026-10-14', '2026-10-17');
    const b = allDay('2026-10-15', '2026-10-16');
    const c = allDay('2026-10-17', '2026-10-18'); // after a: goes back to line 0

    const { bars, lanes } = layoutBars([a, b, c], week);

    expect(lanes).toBe(2);
    expect(bars.map((x) => [x.event, x.lane])).toEqual([
      [a, 0],
      [b, 1],
      [c, 0],
    ]);
  });

  it('ignores timed events unless asked to draw multi-day ones too', () => {
    const night = event({
      start: '2026-10-14T22:00:00Z',
      end: '2026-10-15T02:00:00Z',
    });

    expect(layoutBars([night, timed('09:00', '10:00')], week).bars).toEqual([]);
    expect(
      layoutBars([night, timed('09:00', '10:00')], week, true).bars.map(
        (x) => x.event,
      ),
    ).toEqual([night]);
  });

  it('leaves out events outside the row', () => {
    expect(layoutBars([allDay('2026-11-01', '2026-11-02')], week).bars).toEqual(
      [],
    );
  });

  it('is empty without days', () => {
    expect(layoutBars([allDay('2026-10-14', '2026-10-15')], [])).toEqual({
      bars: [],
      lanes: 0,
    });
  });
});

describe('singleDayEvents', () => {
  it('lists, per day, the timed events that stay within the day', () => {
    const a = timed('11:00', '12:00');
    const b = timed('09:00', '10:00');
    const trip = allDay('2026-10-14', '2026-10-16');
    const days = [dayjs('2026-10-14'), dayjs('2026-10-15')];

    expect(singleDayEvents([a, b, trip], days)).toEqual([[b, a], []]);
  });
});
