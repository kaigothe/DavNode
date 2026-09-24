import type { DataSource } from 'typeorm';
import { Between, LessThan, MoreThanOrEqual } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  CalendarCollection,
  CalendarObject,
  CalendarObjectContent,
  Principal,
  Tenant,
} from './index.js';

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//DavNode//Test//EN',
  'BEGIN:VEVENT',
  'UID:event-1',
  'DTSTART:20260924T100000Z',
  'DTEND:20260924T110000Z',
  'SUMMARY:Meeting',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

describe('CalendarObject and CalendarObjectContent entities', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let owner: Principal;
  let calendar: CalendarCollection;
  let otherCalendar: CalendarCollection;

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
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    owner = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    const calendars = dataSource.getRepository(CalendarCollection);
    calendar = await calendars.save(
      calendars.create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.id,
        name: 'personal',
        displayName: 'Personal',
      }),
    );
    otherCalendar = await calendars.save(
      calendars.create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.id,
        name: 'work',
        displayName: 'Work',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function newObject(overrides: Partial<CalendarObject> = {}): CalendarObject {
    return dataSource.getRepository(CalendarObject).create({
      tenantId: tenant.id,
      calendarId: calendar.id,
      name: 'event-1.ics',
      uid: 'event-1',
      etag: 'etag-1',
      componentType: 'VEVENT',
      ownerPrincipalId: owner.id,
      dtstart: new Date('2026-09-24T10:00:00Z'),
      dtend: new Date('2026-09-24T11:00:00Z'),
      recurrenceSpanEnd: new Date('2026-09-24T11:00:00Z'),
      ...overrides,
    });
  }

  it('persists a calendar object with its content, dates round-tripping as Dates', async () => {
    const objects = dataSource.getRepository(CalendarObject);
    const saved = await objects.save(newObject());
    await dataSource
      .getRepository(CalendarObjectContent)
      .save(
        dataSource
          .getRepository(CalendarObjectContent)
          .create({ calendarObjectId: saved.id, icsData: ICS }),
      );

    const found = await objects.findOneByOrFail({ id: saved.id });
    expect(found.dtstart).toEqual(new Date('2026-09-24T10:00:00Z'));
    expect(found.dtend).toEqual(new Date('2026-09-24T11:00:00Z'));
    expect(found.recurrenceSpanEnd).toEqual(new Date('2026-09-24T11:00:00Z'));
    const content = await dataSource
      .getRepository(CalendarObjectContent)
      .findOneByOrFail({ calendarObjectId: saved.id });
    expect(content.icsData).toBe(ICS);
  });

  it('applies the defaults: opaque, no STATUS, not all-day', async () => {
    const saved = await dataSource
      .getRepository(CalendarObject)
      .save(newObject());

    const found = await dataSource
      .getRepository(CalendarObject)
      .findOneByOrFail({ id: saved.id });
    expect(found.transparency).toBe('opaque');
    expect(found.status).toBeNull();
    expect(found.isAllDay).toBe(false);
  });

  it('stores transparency, status and the all-day flag as given', async () => {
    const objects = dataSource.getRepository(CalendarObject);
    const saved = await objects.save(
      newObject({
        transparency: 'transparent',
        status: 'cancelled',
        isAllDay: true,
      }),
    );

    const found = await objects.findOneByOrFail({ id: saved.id });
    expect(found).toMatchObject({
      transparency: 'transparent',
      status: 'cancelled',
      isAllDay: true,
    });
  });

  it('allows a null dtend and a null recurrenceSpanEnd (an RRULE without UNTIL/COUNT recurs forever)', async () => {
    const objects = dataSource.getRepository(CalendarObject);
    const saved = await objects.save(
      newObject({ dtend: null, recurrenceSpanEnd: null }),
    );

    const found = await objects.findOneByOrFail({ id: saved.id });
    expect(found.dtend).toBeNull();
    expect(found.recurrenceSpanEnd).toBeNull();
    expect(found.dtstart).toEqual(new Date('2026-09-24T10:00:00Z'));
  });

  it('rejects a second object with the same UID in the same calendar, allows it in another', async () => {
    const objects = dataSource.getRepository(CalendarObject);
    await objects.save(newObject());

    await expect(
      objects.save(newObject({ name: 'other-name.ics' })),
    ).rejects.toThrow();
    await expect(
      objects.save(newObject({ calendarId: otherCalendar.id })),
    ).resolves.toBeDefined();
  });

  it('rejects a second object with the same name (URL) in the same calendar, allows it in another', async () => {
    const objects = dataSource.getRepository(CalendarObject);
    await objects.save(newObject());

    await expect(
      objects.save(newObject({ uid: 'another-uid' })),
    ).rejects.toThrow();
    await expect(
      objects.save(
        newObject({ calendarId: otherCalendar.id, uid: 'another-uid' }),
      ),
    ).resolves.toBeDefined();
  });

  it('allows the name to differ from the UID — the two identities are independent', async () => {
    const objects = dataSource.getRepository(CalendarObject);

    const saved = await objects.save(
      newObject({ name: '5E6F-not-the-uid.ics', uid: 'the-real-uid' }),
    );

    const found = await objects.findOneByOrFail({
      calendarId: calendar.id,
      name: '5E6F-not-the-uid.ics',
    });
    expect(found.id).toBe(saved.id);
    expect(found.uid).toBe('the-real-uid');
  });

  it('only accepts VEVENT as component type, and known transparency/status values', async () => {
    const objects = dataSource.getRepository(CalendarObject);

    await expect(
      objects.save(newObject({ componentType: 'VTODO' as 'VEVENT' })),
    ).rejects.toThrow();
    await expect(
      objects.save(
        newObject({
          uid: 'u2',
          name: 'n2.ics',
          status: 'bogus' as 'tentative',
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects an unknown calendar, tenant or owner (FK constraints)', async () => {
    const objects = dataSource.getRepository(CalendarObject);
    const none = '00000000-0000-0000-0000-000000000000';

    await expect(
      objects.save(newObject({ calendarId: none })),
    ).rejects.toThrow();
    await expect(
      objects.save(newObject({ uid: 'u2', name: 'n2.ics', tenantId: none })),
    ).rejects.toThrow();
    await expect(
      objects.save(
        newObject({ uid: 'u3', name: 'n3.ics', ownerPrincipalId: none }),
      ),
    ).rejects.toThrow();
  });

  it('deleting a calendar object leaves no orphaned content row', async () => {
    const saved = await dataSource
      .getRepository(CalendarObject)
      .save(newObject());
    await dataSource
      .getRepository(CalendarObjectContent)
      .save(
        dataSource
          .getRepository(CalendarObjectContent)
          .create({ calendarObjectId: saved.id, icsData: ICS }),
      );

    await dataSource.getRepository(CalendarObject).delete({ id: saved.id });

    expect(await dataSource.getRepository(CalendarObjectContent).count()).toBe(
      0,
    );
  });

  it('holds at most one content row per calendar object', async () => {
    const saved = await dataSource
      .getRepository(CalendarObject)
      .save(newObject());
    const contents = dataSource.getRepository(CalendarObjectContent);
    await contents.save(
      contents.create({ calendarObjectId: saved.id, icsData: ICS }),
    );

    await expect(
      contents.save(
        contents.create({ calendarObjectId: saved.id, icsData: ICS }),
      ),
    ).rejects.toThrow();
  });

  it('stores an iCalendar text far beyond MySQL’s 64 KiB TEXT limit', async () => {
    const saved = await dataSource
      .getRepository(CalendarObject)
      .save(newObject());
    const contents = dataSource.getRepository(CalendarObjectContent);
    const big = `${ICS}${'X-PAD:'.padEnd(200_000, 'x')}\r\n`;

    await contents.save(
      contents.create({ calendarObjectId: saved.id, icsData: big }),
    );

    expect(
      (await contents.findOneByOrFail({ calendarObjectId: saved.id })).icsData,
    ).toBe(big);
  });

  it('range-queries the time-range columns through find operators, keeping two instants of a DST "repeated hour" apart', async () => {
    const objects = dataSource.getRepository(CalendarObject);
    // 02:30 CEST and 02:30 CET on the night the clocks go back: one wall-clock time, two instants.
    await objects.save(
      newObject({
        name: 'a.ics',
        uid: 'a',
        dtstart: new Date('2026-10-25T00:30:00Z'),
      }),
    );
    await objects.save(
      newObject({
        name: 'b.ics',
        uid: 'b',
        dtstart: new Date('2026-10-25T01:30:00Z'),
      }),
    );

    const before = await objects.find({
      where: { dtstart: LessThan(new Date('2026-10-25T01:00:00Z')) },
    });
    const from = await objects.find({
      where: { dtstart: MoreThanOrEqual(new Date('2026-10-25T01:00:00Z')) },
    });
    const between = await objects.find({
      where: {
        dtstart: Between(
          new Date('2026-10-25T00:00:00Z'),
          new Date('2026-10-25T02:00:00Z'),
        ),
      },
      order: { dtstart: 'ASC' },
    });

    expect(before.map((o) => o.uid)).toEqual(['a']);
    expect(from.map((o) => o.uid)).toEqual(['b']);
    expect(between.map((o) => o.uid)).toEqual(['a', 'b']);
  });

  it('has the unique (calendar_id, uid), unique (calendar_id, name) and time-range prefilter indexes', async () => {
    const indexes: Array<{ name: string; unique: number }> =
      await dataSource.query(`PRAGMA index_list('calendar_objects')`);
    const described = await Promise.all(
      indexes.map(async (index) => ({
        unique: index.unique === 1,
        columns: (
          (await dataSource.query(
            `PRAGMA index_info('${index.name}')`,
          )) as Array<{
            name: string;
          }>
        ).map((column) => column.name),
      })),
    );

    expect(described).toContainEqual({
      unique: true,
      columns: ['calendar_id', 'uid'],
    });
    expect(described).toContainEqual({
      unique: true,
      columns: ['calendar_id', 'name'],
    });
    expect(described).toContainEqual({
      unique: false,
      columns: ['calendar_id', 'dtstart', 'recurrence_span_end'],
    });
  });
});
