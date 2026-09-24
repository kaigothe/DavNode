import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarChange,
  CalendarCollection,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { CalendarChangeLog } from './calendar-change-log.js';

describe('CalendarChangeLog', () => {
  let dataSource: DataSource;
  let log: CalendarChangeLog;
  let calendar: CalendarCollection;
  let otherCalendar: CalendarCollection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    log = new CalendarChangeLog();

    const tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    const owner = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    const newCalendar = (name: string): Promise<CalendarCollection> =>
      dataSource.getRepository(CalendarCollection).save(
        dataSource.getRepository(CalendarCollection).create({
          tenantId: tenant.id,
          ownerPrincipalId: owner.id,
          name,
          displayName: name,
        }),
      );
    calendar = await newCalendar('work');
    otherCalendar = await newCalendar('private');
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function record(
    calendarId: string,
    seq: number,
    name: string,
    action: 'added' | 'modified' | 'deleted',
  ): Promise<CalendarChange> {
    return dataSource
      .getRepository(CalendarChange)
      .save(
        dataSource
          .getRepository(CalendarChange)
          .create({ calendarId, seq, name, action }),
      );
  }

  it('returns only the changes after the given seq, oldest first', async () => {
    await record(calendar.id, 1, 'a.ics', 'added');
    await record(calendar.id, 3, 'b.ics', 'deleted');
    await record(calendar.id, 2, 'a.ics', 'modified');

    const changes = await log.loadChangesSince(
      dataSource.manager,
      calendar.id,
      1,
    );

    expect(changes).toEqual([
      { name: 'a.ics', action: 'modified', seq: 2 },
      { name: 'b.ics', action: 'deleted', seq: 3 },
    ]);
  });

  it('returns everything for seq 0 and nothing at the latest seq', async () => {
    await record(calendar.id, 1, 'a.ics', 'added');
    await record(calendar.id, 2, 'b.ics', 'added');

    expect(
      await log.loadChangesSince(dataSource.manager, calendar.id, 0),
    ).toHaveLength(2);
    expect(
      await log.loadChangesSince(dataSource.manager, calendar.id, 2),
    ).toEqual([]);
  });

  it("does not return another calendar's changes", async () => {
    await record(calendar.id, 1, 'a.ics', 'added');
    await record(otherCalendar.id, 1, 'other.ics', 'added');

    const changes = await log.loadChangesSince(
      dataSource.manager,
      calendar.id,
      0,
    );

    expect(changes.map((c) => c.name)).toEqual(['a.ics']);
  });

  it('exposes only name, action and seq, the common denominator of every change log', async () => {
    await record(calendar.id, 1, 'a.ics', 'added');

    const [entry] = await log.loadChangesSince(
      dataSource.manager,
      calendar.id,
      0,
    );

    expect(Object.keys(entry ?? {}).sort()).toEqual(['action', 'name', 'seq']);
  });
});
