import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarCollection,
  CalendarObject,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { expandOccurrences } from './expand-recurrence.js';
import { parseCalendarObject } from './icalendar-parser.js';
import {
  FLOATING_TIME_OFFSET_BOUNDS_MS,
  computeTimeRangeIndex,
  indexCalendarObject,
} from './index-calendar-object.js';

const BERLIN_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function ics(events: string[][], preamble: string[] = []): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//t//EN',
    ...preamble,
    ...events.flatMap((event) => ['BEGIN:VEVENT', ...event, 'END:VEVENT']),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

const parse = (events: string[][], preamble: string[] = []) =>
  parseCalendarObject(ics(events, preamble));
const iso = (date: Date | null) => date?.toISOString().slice(0, 16) ?? null;

describe('computeTimeRangeIndex', () => {
  it('indexes a one-off event: dtstart/dtend as given and recurrenceSpanEnd equal to dtend', () => {
    const index = computeTimeRangeIndex(
      parse([['UID:a', 'DTSTART:20260924T100000Z', 'DTEND:20260924T113000Z']]),
    );

    expect(iso(index.dtstart)).toBe('2026-09-24T10:00');
    expect(iso(index.dtend)).toBe('2026-09-24T11:30');
    expect(iso(index.recurrenceSpanEnd)).toBe('2026-09-24T11:30');
    expect(index).toMatchObject({
      isAllDay: false,
      transparency: 'opaque',
      status: null,
    });
  });

  it('computes dtend from DTSTART + DURATION', () => {
    const index = computeTimeRangeIndex(
      parse([['UID:a', 'DTSTART:20260924T100000Z', 'DURATION:PT1H30M']]),
    );

    expect(iso(index.dtend)).toBe('2026-09-24T11:30');
    expect(iso(index.recurrenceSpanEnd)).toBe('2026-09-24T11:30');
  });

  it('gives an event without DTEND and DURATION its effective end: a day for a DATE start, zero length for a DATE-TIME start', () => {
    const allDay = computeTimeRangeIndex(
      parse([['UID:d', 'DTSTART;VALUE=DATE:20260924']]),
    );
    const point = computeTimeRangeIndex(
      parse([['UID:p', 'DTSTART:20260924T100000Z']]),
    );

    expect(allDay).toMatchObject({ isAllDay: true });
    expect(iso(allDay.dtstart)).toBe('2026-09-24T00:00');
    expect(iso(allDay.dtend)).toBe('2026-09-25T00:00');
    expect(iso(point.dtend)).toBe('2026-09-24T10:00');
  });

  it('sets recurrenceSpanEnd to the last instance’s end for COUNT, and null without UNTIL/COUNT', () => {
    const counted = computeTimeRangeIndex(
      parse([
        [
          'UID:c',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=WEEKLY;COUNT=4',
        ],
      ]),
    );
    const unbounded = computeTimeRangeIndex(
      parse([
        [
          'UID:u',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=DAILY',
        ],
      ]),
    );

    expect(iso(counted.recurrenceSpanEnd)).toBe('2026-06-22T10:00');
    expect(iso(counted.dtend)).toBe('2026-06-01T10:00'); // the master's own (first) end
    expect(unbounded.recurrenceSpanEnd).toBeNull();
  });

  it('reads TZID times through their zone', () => {
    const index = computeTimeRangeIndex(
      parse(
        [
          [
            'UID:z',
            'DTSTART;TZID=Europe/Berlin:20260715T090000',
            'DTEND;TZID=Europe/Berlin:20260715T100000',
          ],
        ],
        BERLIN_VTIMEZONE,
      ),
    );

    expect(iso(index.dtstart)).toBe('2026-07-15T07:00');
    expect(iso(index.dtend)).toBe('2026-07-15T08:00');
  });

  it('reads floating times and dates as UTC — the stored convention', () => {
    const index = computeTimeRangeIndex(
      parse([['UID:f', 'DTSTART:20260715T090000', 'DTEND:20260715T100000']]),
    );

    expect(iso(index.dtstart)).toBe('2026-07-15T09:00');
    expect(iso(index.dtend)).toBe('2026-07-15T10:00');
  });

  it('takes transparency and status from the master', () => {
    const index = computeTimeRangeIndex(
      parse([
        [
          'UID:t',
          'DTSTART:20260924T100000Z',
          'TRANSP:TRANSPARENT',
          'STATUS:TENTATIVE',
        ],
      ]),
    );

    expect(index).toMatchObject({
      transparency: 'transparent',
      status: 'tentative',
    });
  });

  it('starts at the earliest occurrence: an override or RDATE before the master’s DTSTART', () => {
    const override = computeTimeRangeIndex(
      parse([
        [
          'UID:o',
          'DTSTART:20260610T090000Z',
          'DTEND:20260610T100000Z',
          'RRULE:FREQ=DAILY;COUNT=3',
        ],
        [
          'UID:o',
          'RECURRENCE-ID:20260611T090000Z',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
        ],
      ]),
    );
    const rdate = computeTimeRangeIndex(
      parse([
        [
          'UID:r',
          'DTSTART:20260610T090000Z',
          'DTEND:20260610T100000Z',
          'RDATE:20260501T090000Z',
        ],
      ]),
    );

    expect(iso(override.dtstart)).toBe('2026-06-01T09:00');
    expect(iso(rdate.dtstart)).toBe('2026-05-01T09:00');
    // dtend stays the master's own effective end.
    expect(iso(override.dtend)).toBe('2026-06-10T10:00');
  });

  it('ends at the latest occurrence: an override moved past the last instance, an RDATE after UNTIL', () => {
    const moved = computeTimeRangeIndex(
      parse([
        [
          'UID:o',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=DAILY;COUNT=3',
        ],
        [
          'UID:o',
          'RECURRENCE-ID:20260603T090000Z',
          'DTSTART:20260720T090000Z',
          'DTEND:20260720T100000Z',
        ],
      ]),
    );
    const rdate = computeTimeRangeIndex(
      parse([
        [
          'UID:r',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=DAILY;COUNT=3',
          'RDATE:20260901T090000Z',
        ],
      ]),
    );

    expect(iso(moved.recurrenceSpanEnd)).toBe('2026-07-20T10:00');
    expect(iso(rdate.recurrenceSpanEnd)).toBe('2026-09-01T10:00');
  });

  it('indexes an object of overrides only, from its earliest override', () => {
    const index = computeTimeRangeIndex(
      parse([
        [
          'UID:o',
          'RECURRENCE-ID:20260605T090000Z',
          'DTSTART:20260605T080000Z',
          'DTEND:20260605T090000Z',
          'STATUS:CANCELLED',
        ],
        [
          'UID:o',
          'RECURRENCE-ID:20260603T090000Z',
          'DTSTART:20260603T110000Z',
          'DTEND:20260603T120000Z',
          'TRANSP:TRANSPARENT',
        ],
      ]),
    );

    expect(iso(index.dtstart)).toBe('2026-06-03T11:00');
    expect(iso(index.dtend)).toBe('2026-06-03T12:00');
    expect(iso(index.recurrenceSpanEnd)).toBe('2026-06-05T09:00');
    expect(index).toMatchObject({ transparency: 'transparent', status: null });
  });

  it('exposes the floating-time offset bounds: UTC−12 to UTC+14', () => {
    expect(FLOATING_TIME_OFFSET_BOUNDS_MS).toEqual({
      earliest: -12 * 3_600_000,
      latest: 14 * 3_600_000,
    });
  });
});

describe('indexCalendarObject', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let owner: Principal;
  let calendar: CalendarCollection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource.getRepository(Tenant).create({ slug: 'acme', name: 'Acme' }),
      );
    owner = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.id,
        displayName: 'Personal',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function insert(name: string, uid: string): Promise<CalendarObject> {
    return dataSource.getRepository(CalendarObject).save(
      dataSource.getRepository(CalendarObject).create({
        tenantId: tenant.id,
        calendarId: calendar.id,
        name,
        uid,
        etag: 'e',
        componentType: 'VEVENT',
        ownerPrincipalId: owner.id,
        dtstart: new Date(0),
        dtend: new Date(0),
        recurrenceSpanEnd: new Date(0),
        transparency: 'transparent',
        status: 'cancelled',
        isAllDay: true,
      }),
    );
  }

  it('writes dtstart/dtend for a one-off event with recurrenceSpanEnd equal to dtend', async () => {
    const object = await insert('a.ics', 'a');

    await dataSource.transaction((manager) =>
      indexCalendarObject(
        manager,
        object.id,
        parse([
          ['UID:a', 'DTSTART:20260924T100000Z', 'DTEND:20260924T113000Z'],
        ]),
      ),
    );

    const found = await dataSource
      .getRepository(CalendarObject)
      .findOneByOrFail({ id: object.id });
    expect(iso(found.dtstart)).toBe('2026-09-24T10:00');
    expect(iso(found.dtend)).toBe('2026-09-24T11:30');
    expect(iso(found.recurrenceSpanEnd)).toBe('2026-09-24T11:30');
    expect(found).toMatchObject({
      isAllDay: false,
      transparency: 'opaque',
      status: null,
    });
  });

  it('stores the computed end of the last instance for a COUNT series, and null for an unbounded one', async () => {
    const counted = await insert('c.ics', 'c');
    const unbounded = await insert('u.ics', 'u');

    await indexCalendarObject(
      dataSource.manager,
      counted.id,
      parse([
        [
          'UID:c',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=DAILY;COUNT=10',
        ],
      ]),
    );
    await indexCalendarObject(
      dataSource.manager,
      unbounded.id,
      parse([
        [
          'UID:u',
          'DTSTART:20260601T090000Z',
          'DTEND:20260601T100000Z',
          'RRULE:FREQ=DAILY',
        ],
      ]),
    );

    const repository = dataSource.getRepository(CalendarObject);
    expect(
      iso(
        (await repository.findOneByOrFail({ id: counted.id }))
          .recurrenceSpanEnd,
      ),
    ).toBe('2026-06-10T10:00');
    expect(
      (await repository.findOneByOrFail({ id: unbounded.id }))
        .recurrenceSpanEnd,
    ).toBeNull();
  });

  it('a re-index overwrites every column — nothing of the previous version survives', async () => {
    const object = await insert('a.ics', 'a');
    const repository = dataSource.getRepository(CalendarObject);
    await indexCalendarObject(
      dataSource.manager,
      object.id,
      parse([
        [
          'UID:a',
          'DTSTART;VALUE=DATE:20260601',
          'RRULE:FREQ=DAILY;COUNT=3',
          'TRANSP:TRANSPARENT',
          'STATUS:CANCELLED',
        ],
      ]),
    );
    expect(await repository.findOneByOrFail({ id: object.id })).toMatchObject({
      isAllDay: true,
      transparency: 'transparent',
      status: 'cancelled',
    });

    await indexCalendarObject(
      dataSource.manager,
      object.id,
      parse([
        [
          'UID:a',
          'DTSTART:20261001T140000Z',
          'DTEND:20261001T150000Z',
          'RRULE:FREQ=WEEKLY',
        ],
      ]),
    );

    const found = await repository.findOneByOrFail({ id: object.id });
    expect(iso(found.dtstart)).toBe('2026-10-01T14:00');
    expect(iso(found.dtend)).toBe('2026-10-01T15:00');
    expect(found.recurrenceSpanEnd).toBeNull();
    expect(found).toMatchObject({
      isAllDay: false,
      transparency: 'opaque',
      status: null,
    });
  });

  it('re-indexing identical content is fine (an unchanged UPDATE is not "object missing")', async () => {
    const object = await insert('a.ics', 'a');
    const parsed = parse([
      ['UID:a', 'DTSTART:20260924T100000Z', 'DTEND:20260924T110000Z'],
    ]);

    await indexCalendarObject(dataSource.manager, object.id, parsed);

    await expect(
      indexCalendarObject(dataSource.manager, object.id, parsed),
    ).resolves.toBeUndefined();
  });

  it('throws for an object that does not exist', async () => {
    await expect(
      indexCalendarObject(
        dataSource.manager,
        '00000000-0000-0000-0000-000000000000',
        parse([['UID:a', 'DTSTART:20260924T100000Z']]),
      ),
    ).rejects.toThrow(/No CalendarObject/);
  });

  it('commits or rolls back together with the caller’s transaction', async () => {
    const object = await insert('a.ics', 'a');

    await expect(
      dataSource.transaction(async (manager) => {
        await indexCalendarObject(
          manager,
          object.id,
          parse([
            ['UID:a', 'DTSTART:20260924T100000Z', 'DTEND:20260924T110000Z'],
          ]),
        );
        throw new Error('the content write failed');
      }),
    ).rejects.toThrow('the content write failed');

    const found = await dataSource
      .getRepository(CalendarObject)
      .findOneByOrFail({ id: object.id });
    expect(found.dtstart.getTime()).toBe(0); // still the values from before the failed transaction
    expect(found.isAllDay).toBe(true);
  });

  describe('as a prefilter for time-range queries', () => {
    /** Objects covering the shapes the index has to be sound for. `floating` marks those read in a query-chosen zone. */
    const CORPUS: Array<{
      name: string;
      events: string[][];
      preamble?: string[];
      floating?: boolean;
    }> = [
      {
        name: 'one-off UTC',
        events: [
          ['UID:1', 'DTSTART:20260310T090000Z', 'DTEND:20260310T101500Z'],
        ],
      },
      {
        name: 'one-off Berlin across DST',
        events: [
          [
            'UID:2',
            'DTSTART;TZID=Europe/Berlin:20261025T013000',
            'DTEND;TZID=Europe/Berlin:20261025T033000',
          ],
        ],
        preamble: BERLIN_VTIMEZONE,
      },
      {
        name: 'multi-day all-day',
        events: [
          ['UID:3', 'DTSTART;VALUE=DATE:20260401', 'DTEND;VALUE=DATE:20260405'],
        ],
        floating: true,
      },
      {
        name: 'floating',
        events: [['UID:4', 'DTSTART:20260515T230000', 'DTEND:20260516T010000']],
        floating: true,
      },
      { name: 'point event', events: [['UID:5', 'DTSTART:20260601T120000Z']] },
      {
        name: 'zero-length with DTEND',
        events: [
          ['UID:6', 'DTSTART:20260602T120000Z', 'DTEND:20260602T120000Z'],
        ],
      },
      {
        name: 'DURATION',
        events: [['UID:7', 'DTSTART:20260701T060000Z', 'DURATION:P2DT3H']],
      },
      {
        name: 'weekly COUNT',
        events: [
          [
            'UID:8',
            'DTSTART:20260105T090000Z',
            'DTEND:20260105T100000Z',
            'RRULE:FREQ=WEEKLY;COUNT=20',
          ],
        ],
      },
      {
        name: 'weekly UNTIL',
        events: [
          [
            'UID:9',
            'DTSTART:20260105T090000Z',
            'DTEND:20260105T100000Z',
            'RRULE:FREQ=WEEKLY;UNTIL=20260615T090000Z',
          ],
        ],
      },
      {
        name: 'daily unbounded',
        events: [
          [
            'UID:10',
            'DTSTART:20260201T220000Z',
            'DTEND:20260201T233000Z',
            'RRULE:FREQ=DAILY',
          ],
        ],
      },
      {
        name: 'monthly last Friday with EXDATE',
        events: [
          [
            'UID:11',
            'DTSTART:20260130T170000Z',
            'DTEND:20260130T180000Z',
            'RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=12',
            'EXDATE:20260327T170000Z',
          ],
        ],
      },
      {
        name: 'Berlin daily series across both changes',
        events: [
          [
            'UID:12',
            'DTSTART;TZID=Europe/Berlin:20260320T083000',
            'DTEND;TZID=Europe/Berlin:20260320T093000',
            'RRULE:FREQ=DAILY;COUNT=250',
          ],
        ],
        preamble: BERLIN_VTIMEZONE,
      },
      {
        name: 'RDATE before and after the master',
        events: [
          [
            'UID:13',
            'DTSTART:20260601T090000Z',
            'DTEND:20260601T100000Z',
            'RDATE:20260401T090000Z,20260901T090000Z',
          ],
        ],
      },
      {
        name: 'RDATE PERIOD',
        events: [
          [
            'UID:14',
            'DTSTART:20260601T090000Z',
            'DTEND:20260601T100000Z',
            'RDATE;VALUE=PERIOD:20260810T090000Z/20260812T090000Z',
          ],
        ],
      },
      {
        name: 'override moved before the master',
        events: [
          [
            'UID:15',
            'DTSTART:20260610T090000Z',
            'DTEND:20260610T100000Z',
            'RRULE:FREQ=DAILY;COUNT=3',
          ],
          [
            'UID:15',
            'RECURRENCE-ID:20260611T090000Z',
            'DTSTART:20260301T090000Z',
            'DTEND:20260301T100000Z',
          ],
        ],
      },
      {
        name: 'override moved past the last instance',
        events: [
          [
            'UID:16',
            'DTSTART:20260610T090000Z',
            'DTEND:20260610T100000Z',
            'RRULE:FREQ=DAILY;COUNT=3',
          ],
          [
            'UID:16',
            'RECURRENCE-ID:20260612T090000Z',
            'DTSTART:20261120T090000Z',
            'DTEND:20261120T100000Z',
          ],
        ],
      },
      {
        name: 'overrides only',
        events: [
          [
            'UID:17',
            'RECURRENCE-ID:20260803T090000Z',
            'DTSTART:20260803T110000Z',
            'DTEND:20260803T120000Z',
          ],
          [
            'UID:17',
            'RECURRENCE-ID:20260805T090000Z',
            'DTSTART:20260805T080000Z',
            'DTEND:20260805T090000Z',
          ],
        ],
      },
      {
        name: 'floating weekly series',
        events: [
          [
            'UID:18',
            'DTSTART:20260105T233000',
            'DTEND:20260106T003000',
            'RRULE:FREQ=WEEKLY;COUNT=30',
          ],
        ],
        floating: true,
      },
    ];
    const FLOATING_ZONES = [
      null,
      'Europe/Berlin',
      'America/Los_Angeles',
      'Pacific/Kiritimati',
      'Etc/GMT+12',
      'Pacific/Auckland',
    ];
    const HOUR = 3_600_000;
    const DAY = 24 * HOUR;

    /** Uids of the objects the index prefilter selects for a range, optionally widened for floating times. */
    async function prefilter(
      from: number,
      to: number,
      widen: boolean,
    ): Promise<Set<string>> {
      const { earliest, latest } = FLOATING_TIME_OFFSET_BOUNDS_MS;
      const rows = await dataSource
        .getRepository(CalendarObject)
        .createQueryBuilder('o')
        .where('o.calendarId = :calendarId', { calendarId: calendar.id })
        .andWhere('o.dtstart < :end', { end: to + (widen ? latest : 0) })
        .andWhere(
          '(o.recurrenceSpanEnd IS NULL OR o.recurrenceSpanEnd >= :start)',
          { start: from + (widen ? earliest : 0) },
        )
        .getMany();
      return new Set(rows.map((row) => row.uid));
    }

    it('never hides an object with an occurrence in the range, for exact times without any widening', async () => {
      const parsedByUid = new Map<string, ReturnType<typeof parse>>();
      for (const item of CORPUS.filter((c) => !c.floating)) {
        const parsed = parse(item.events, item.preamble);
        const object = await insert(`${parsed.uid}.ics`, parsed.uid);
        await indexCalendarObject(dataSource.manager, object.id, parsed);
        parsedByUid.set(parsed.uid, parsed);
      }
      let compared = 0;
      for (let day = 0; day < 640; day += 6) {
        for (const length of [HOUR, 20 * HOUR, 6 * DAY, 45 * DAY]) {
          const from = Date.UTC(2026, 0, 1) + day * DAY + (day % 5) * HOUR;
          const selected = await prefilter(from, from + length, false);
          for (const [uid, parsed] of parsedByUid) {
            const exact =
              expandOccurrences(parsed, new Date(from), new Date(from + length))
                .length > 0;
            if (exact) {
              expect(
                selected.has(uid),
                `${uid} for [${new Date(from).toISOString()}, +${length / HOUR}h)`,
              ).toBe(true);
            }
            compared += 1;
          }
        }
      }
      expect(compared).toBeGreaterThan(2000);
    }, 30_000);

    it('never hides a floating or all-day object, whatever zone the query resolves it in, once widened by the offset bounds', async () => {
      const parsedByUid = new Map<string, ReturnType<typeof parse>>();
      for (const item of CORPUS.filter((c) => c.floating)) {
        const parsed = parse(item.events, item.preamble);
        const object = await insert(`${parsed.uid}.ics`, parsed.uid);
        await indexCalendarObject(dataSource.manager, object.id, parsed);
        parsedByUid.set(parsed.uid, parsed);
      }
      for (let day = 0; day < 300; day += 4) {
        for (const length of [HOUR, 20 * HOUR, 6 * DAY]) {
          const from = Date.UTC(2026, 0, 1) + day * DAY + (day % 7) * HOUR;
          const selected = await prefilter(from, from + length, true);
          for (const [uid, parsed] of parsedByUid) {
            for (const floatingTimeZone of FLOATING_ZONES) {
              const exact =
                expandOccurrences(
                  parsed,
                  new Date(from),
                  new Date(from + length),
                  { floatingTimeZone },
                ).length > 0;
              if (exact) {
                expect(
                  selected.has(uid),
                  `${uid} in ${floatingTimeZone} for [${new Date(from).toISOString()}, +${length / HOUR}h)`,
                ).toBe(true);
              }
            }
          }
        }
      }
    }, 30_000);

    it('would miss floating objects without the widening — the bounds are needed, not decoration', async () => {
      const parsed = parse([
        ['UID:4', 'DTSTART:20260515T230000', 'DTEND:20260516T010000'],
      ]);
      const object = await insert('4.ics', '4');
      await indexCalendarObject(dataSource.manager, object.id, parsed);
      // In Auckland (UTC+12) the event is 2026-05-15T11:00Z..13:00Z; stored as UTC it is 23:00..01:00.
      const from = Date.UTC(2026, 4, 15, 11);
      const to = Date.UTC(2026, 4, 15, 13);

      expect(
        expandOccurrences(parsed, new Date(from), new Date(to), {
          floatingTimeZone: 'Pacific/Auckland',
        }),
      ).toHaveLength(1);
      expect((await prefilter(from, to, false)).has('4')).toBe(false);
      expect((await prefilter(from, to, true)).has('4')).toBe(true);
    });

    it('is reasonably selective: an old, ended one-off event is not selected for a range years later', async () => {
      const object = await insert('old.ics', 'old');
      await indexCalendarObject(
        dataSource.manager,
        object.id,
        parse([
          ['UID:old', 'DTSTART:20200101T090000Z', 'DTEND:20200101T100000Z'],
        ]),
      );

      expect(
        (await prefilter(Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1), true)).has(
          'old',
        ),
      ).toBe(false);
    });
  });
});
