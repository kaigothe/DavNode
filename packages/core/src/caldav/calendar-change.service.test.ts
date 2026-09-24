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
import { CalendarChangeService } from './calendar-change.service.js';

describe('CalendarChangeService', () => {
  let dataSource: DataSource;
  let service: CalendarChangeService;
  let calendar: CalendarCollection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new CalendarChangeService();

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
    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
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

  it('bumps the calendar syncSeq and records a change with the matching seq', async () => {
    await dataSource.transaction((manager) =>
      service.recordChange(manager, calendar.id, 'event.ics', 'added'),
    );

    const reloaded = await dataSource
      .getRepository(CalendarCollection)
      .findOneByOrFail({ id: calendar.id });
    expect(reloaded.syncSeq).toBe(1);
    expect(
      await dataSource
        .getRepository(CalendarChange)
        .findBy({ calendarId: calendar.id }),
    ).toEqual([
      expect.objectContaining({
        calendarId: calendar.id,
        seq: 1,
        name: 'event.ics',
        action: 'added',
      }),
    ]);
  });

  it('assigns strictly increasing seq numbers across successive changes', async () => {
    await dataSource.transaction((manager) =>
      service.recordChange(manager, calendar.id, 'a.ics', 'added'),
    );
    await dataSource.transaction((manager) =>
      service.recordChange(manager, calendar.id, 'a.ics', 'modified'),
    );
    await dataSource.transaction((manager) =>
      service.recordChange(manager, calendar.id, 'a.ics', 'deleted'),
    );

    const changes = await dataSource
      .getRepository(CalendarChange)
      .find({ where: { calendarId: calendar.id }, order: { seq: 'ASC' } });
    expect(changes.map((c) => [c.seq, c.action])).toEqual([
      [1, 'added'],
      [2, 'modified'],
      [3, 'deleted'],
    ]);
  });

  it('rolls back the syncSeq bump and the change record with the surrounding transaction', async () => {
    await expect(
      dataSource.transaction(async (manager) => {
        await service.recordChange(manager, calendar.id, 'a.ics', 'added');
        throw new Error('simulated failure after recording the change');
      }),
    ).rejects.toThrow('simulated failure');

    expect(
      (
        await dataSource
          .getRepository(CalendarCollection)
          .findOneByOrFail({ id: calendar.id })
      ).syncSeq,
    ).toBe(0);
    expect(await dataSource.getRepository(CalendarChange).count()).toBe(0);
  });
});
