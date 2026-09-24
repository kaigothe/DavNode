import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  CalendarChange,
  CalendarCollection,
  CalendarObject,
  Principal,
  Tenant,
} from './index.js';

describe('CalendarChange entity', () => {
  let dataSource: DataSource;
  let calendar: CalendarCollection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    const tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    const ownerPrincipal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: ownerPrincipal.id,
        name: 'personal',
        displayName: 'Personal',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists a change record', async () => {
    const repository = dataSource.getRepository(CalendarChange);
    const saved = await repository.save(
      repository.create({
        calendarId: calendar.id,
        seq: 1,
        name: 'event.ics',
        action: 'added',
      }),
    );

    const found = await repository.findOneByOrFail({ id: saved.id });
    expect(found.action).toBe('added');
    expect(found.name).toBe('event.ics');
    expect(found.seq).toBe(1);
  });

  it('rejects a duplicate (calendarId, seq) via plain insert', async () => {
    const repository = dataSource.getRepository(CalendarChange);
    await repository.save(
      repository.create({
        calendarId: calendar.id,
        seq: 1,
        name: 'event.ics',
        action: 'added',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          calendarId: calendar.id,
          seq: 1,
          name: 'other.vcf',
          action: 'added',
        }),
      ),
    ).rejects.toThrow();
  });

  it('allows the same seq for a different calendar', async () => {
    const otherCalendar = await dataSource
      .getRepository(CalendarCollection)
      .save(
        dataSource.getRepository(CalendarCollection).create({
          tenantId: calendar.tenantId,
          ownerPrincipalId: calendar.ownerPrincipalId,
          name: 'work',
          displayName: 'Work',
        }),
      );
    const repository = dataSource.getRepository(CalendarChange);
    await repository.save(
      repository.create({
        calendarId: calendar.id,
        seq: 1,
        name: 'event.ics',
        action: 'added',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          calendarId: otherCalendar.id,
          seq: 1,
          name: 'other.vcf',
          action: 'added',
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('keeps reporting a deletion after the referenced CalendarObject row is gone (no live FK)', async () => {
    const calendarObject = await dataSource.getRepository(CalendarObject).save(
      dataSource.getRepository(CalendarObject).create({
        tenantId: calendar.tenantId,
        calendarId: calendar.id,
        name: 'event.ics',
        uid: 'uid-1',
        etag: 'etag-1',
        componentType: 'VEVENT',
        ownerPrincipalId: calendar.ownerPrincipalId,
        dtstart: new Date('2026-09-24T10:00:00Z'),
      }),
    );
    const repository = dataSource.getRepository(CalendarChange);
    await repository.save(
      repository.create({
        calendarId: calendar.id,
        seq: 1,
        name: calendarObject.name,
        action: 'deleted',
      }),
    );

    await dataSource
      .getRepository(CalendarObject)
      .delete({ id: calendarObject.id });

    const found = await repository.findOneByOrFail({
      calendarId: calendar.id,
      seq: 1,
    });
    expect(found.action).toBe('deleted');
    expect(found.name).toBe('event.ics');
  });
});
