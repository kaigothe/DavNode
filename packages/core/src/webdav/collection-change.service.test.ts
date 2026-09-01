import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { CollectionChange } from '../entities/collection-change.entity.js';
import {
  ALL_ENTITIES,
  Collection,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { CollectionChangeService } from './collection-change.service.js';

describe('CollectionChangeService', () => {
  let dataSource: DataSource;
  let service: CollectionChangeService;
  let collection: Collection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new CollectionChangeService();

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
    collection = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'root',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('bumps the parent collection syncSeq and records a change with the matching seq', async () => {
    await dataSource.transaction(async (manager) => {
      await service.recordChange(manager, collection.id, 'report.txt', 'added');
    });

    const reloaded = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ id: collection.id });
    expect(reloaded.syncSeq).toBe(1);

    const changes = await dataSource
      .getRepository(CollectionChange)
      .findBy({ collectionId: collection.id });
    expect(changes).toEqual([
      expect.objectContaining({
        collectionId: collection.id,
        seq: 1,
        name: 'report.txt',
        action: 'added',
      }),
    ]);
  });

  it('assigns strictly increasing seq numbers across successive changes', async () => {
    await dataSource.transaction((manager) =>
      service.recordChange(manager, collection.id, 'a.txt', 'added'),
    );
    await dataSource.transaction((manager) =>
      service.recordChange(manager, collection.id, 'b.txt', 'added'),
    );
    await dataSource.transaction((manager) =>
      service.recordChange(manager, collection.id, 'a.txt', 'deleted'),
    );

    const reloaded = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ id: collection.id });
    expect(reloaded.syncSeq).toBe(3);

    const changes = await dataSource
      .getRepository(CollectionChange)
      .findBy({ collectionId: collection.id });
    expect(changes.map((c) => c.seq).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('rolls back both the syncSeq bump and the change record if the surrounding transaction fails', async () => {
    await expect(
      dataSource.transaction(async (manager) => {
        await service.recordChange(manager, collection.id, 'a.txt', 'added');
        throw new Error('simulated failure after recording the change');
      }),
    ).rejects.toThrow('simulated failure');

    const reloaded = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ id: collection.id });
    expect(reloaded.syncSeq).toBe(0);
    expect(
      await dataSource
        .getRepository(CollectionChange)
        .findBy({ collectionId: collection.id }),
    ).toEqual([]);
  });
});
