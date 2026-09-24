import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  CalendarCollection,
  CalendarProperty,
  Principal,
  Tenant,
} from './index.js';

describe('CalendarProperty entity', () => {
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
        displayName: 'Personal',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists a dead property', async () => {
    const repository = dataSource.getRepository(CalendarProperty);
    await repository.save(
      repository.create({
        calendarId: calendar.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      }),
    );

    const found = await repository.findOneByOrFail({
      calendarId: calendar.id,
      namespace: 'DAV:',
      name: 'custom-prop',
    });
    expect(found.value).toBe('value1');
  });

  it('rejects a duplicate (calendarId, namespace, name) via plain insert', async () => {
    const repository = dataSource.getRepository(CalendarProperty);
    await repository.save(
      repository.create({
        calendarId: calendar.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          calendarId: calendar.id,
          namespace: 'DAV:',
          name: 'custom-prop',
          value: 'value2',
        }),
      ),
    ).rejects.toThrow();
  });

  it('overwrites the value instead of duplicating when set again (upsert)', async () => {
    const repository = dataSource.getRepository(CalendarProperty);
    const conflictPaths = ['calendarId', 'namespace', 'name'];
    await repository.upsert(
      {
        calendarId: calendar.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      },
      conflictPaths,
    );

    await repository.upsert(
      {
        calendarId: calendar.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value2',
      },
      conflictPaths,
    );

    const rows = await repository.findBy({
      calendarId: calendar.id,
      namespace: 'DAV:',
      name: 'custom-prop',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('value2');
  });

  it('allows the same property name in a different namespace, and on another calendar', async () => {
    const repository = dataSource.getRepository(CalendarProperty);
    const other = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: calendar.tenantId,
        ownerPrincipalId: calendar.ownerPrincipalId,
        displayName: 'Work',
      }),
    );
    await repository.save(
      repository.create({
        calendarId: calendar.id,
        namespace: 'DAV:',
        name: 'color',
        value: 'red',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          calendarId: calendar.id,
          namespace: 'urn:example',
          name: 'color',
          value: 'blue',
        }),
      ),
    ).resolves.toBeDefined();
    await expect(
      repository.save(
        repository.create({
          calendarId: other.id,
          namespace: 'DAV:',
          name: 'color',
          value: 'green',
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('rejects a property on an unknown calendar (FK constraint)', async () => {
    const repository = dataSource.getRepository(CalendarProperty);

    await expect(
      repository.save(
        repository.create({
          calendarId: '00000000-0000-0000-0000-000000000000',
          namespace: 'DAV:',
          name: 'x',
          value: 'y',
        }),
      ),
    ).rejects.toThrow();
  });
});
