import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  CalendarCollection,
  Principal,
  Tenant,
} from './index.js';

describe('CalendarCollection entity', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let ownerPrincipal: Principal;

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
    ownerPrincipal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function newCalendar(
    displayName: string,
    extra: Partial<CalendarCollection> = {},
  ): CalendarCollection {
    return dataSource.getRepository(CalendarCollection).create({
      tenantId: tenant.id,
      ownerPrincipalId: ownerPrincipal.id,
      displayName,
      ...extra,
    });
  }

  it('persists a calendar with defaults: VEVENT only, no feed token, no description/timezone, syncSeq 0', async () => {
    const repository = dataSource.getRepository(CalendarCollection);

    const saved = await repository.save(newCalendar('Personal'));

    const found = await repository.findOneByOrFail({ id: saved.id });
    expect(found.supportedComponentSet).toEqual(['VEVENT']);
    expect(found.icsFeedToken).toBeNull();
    expect(found.description).toBeNull();
    expect(found.timezone).toBeNull();
    expect(found.syncSeq).toBe(0);
  });

  it('allows two calendars owned by the same principal to coexist', async () => {
    const repository = dataSource.getRepository(CalendarCollection);
    await repository.save(newCalendar('Personal'));

    await expect(
      repository.save(
        newCalendar('Work', {
          description: 'Work events',
          timezone: 'Europe/Berlin',
        }),
      ),
    ).resolves.toBeDefined();

    const all = await repository.findBy({
      ownerPrincipalId: ownerPrincipal.id,
    });
    expect(all.map((calendar) => calendar.displayName).sort()).toEqual([
      'Personal',
      'Work',
    ]);
  });

  it('rejects an unknown owner principal (FK constraint)', async () => {
    const repository = dataSource.getRepository(CalendarCollection);

    await expect(
      repository.save(
        newCalendar('Orphan', {
          ownerPrincipalId: '00000000-0000-0000-0000-000000000000',
        }),
      ),
    ).rejects.toThrow();
  });

  it('round-trips the component set through its comma-separated column, including an empty set', async () => {
    const repository = dataSource.getRepository(CalendarCollection);
    // Only VEVENT exists in v1 — the set is deliberately modelled as a list so
    // a later component type is a data change, not a schema change.
    const events = await repository.save(
      newCalendar('Events', { supportedComponentSet: ['VEVENT'] }),
    );
    const none = await repository.save(
      newCalendar('None', { supportedComponentSet: [] }),
    );

    expect(
      (await repository.findOneByOrFail({ id: events.id }))
        .supportedComponentSet,
    ).toEqual(['VEVENT']);
    expect(
      (await repository.findOneByOrFail({ id: none.id })).supportedComponentSet,
    ).toEqual([]);
  });

  it('allows any number of calendars without a feed token, but a set token is unique', async () => {
    const repository = dataSource.getRepository(CalendarCollection);
    await repository.save(newCalendar('No feed 1'));
    await repository.save(newCalendar('No feed 2'));
    await repository.save(newCalendar('Feed A', { icsFeedToken: 'token-a' }));

    await expect(
      repository.save(newCalendar('Feed B', { icsFeedToken: 'token-b' })),
    ).resolves.toBeDefined();
    await expect(
      repository.save(newCalendar('Duplicate', { icsFeedToken: 'token-a' })),
    ).rejects.toThrow();
    // The token identifies the calendar on its own.
    expect(
      (await repository.findOneByOrFail({ icsFeedToken: 'token-b' }))
        .displayName,
    ).toBe('Feed B');
  });

  it('has the (tenant_id, owner_principal_id) index and the unique ics_feed_token index', async () => {
    const indexes: Array<{ name: string; unique: number }> =
      await dataSource.query(`PRAGMA index_list('calendars')`);
    const columnsOf = async (name: string): Promise<string[]> =>
      (
        (await dataSource.query(`PRAGMA index_info('${name}')`)) as Array<{
          name: string;
        }>
      ).map((column) => column.name);

    const described = await Promise.all(
      indexes.map(async (index) => ({
        unique: index.unique === 1,
        columns: await columnsOf(index.name),
      })),
    );
    expect(described).toContainEqual({
      unique: false,
      columns: ['tenant_id', 'owner_principal_id'],
    });
    expect(described).toContainEqual({
      unique: true,
      columns: ['ics_feed_token'],
    });
  });
});
