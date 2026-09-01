import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  Collection,
  CollectionChange,
  Principal,
  Tenant,
} from './index.js';

describe('CollectionChange entity', () => {
  let dataSource: DataSource;
  let collection: Collection;

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
    collection = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'Root',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists a change record', async () => {
    const repository = dataSource.getRepository(CollectionChange);
    const saved = await repository.save(
      repository.create({
        collectionId: collection.id,
        seq: 1,
        name: 'report.txt',
        action: 'added',
      }),
    );

    const found = await repository.findOneByOrFail({ id: saved.id });
    expect(found.action).toBe('added');
    expect(found.name).toBe('report.txt');
    expect(found.seq).toBe(1);
  });

  it('rejects a duplicate (collectionId, seq) via plain insert', async () => {
    const repository = dataSource.getRepository(CollectionChange);
    await repository.save(
      repository.create({
        collectionId: collection.id,
        seq: 1,
        name: 'report.txt',
        action: 'added',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          collectionId: collection.id,
          seq: 1,
          name: 'other.txt',
          action: 'added',
        }),
      ),
    ).rejects.toThrow();
  });

  it('allows the same seq for a different collection', async () => {
    const otherCollection = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: collection.tenantId,
        parentCollectionId: collection.id,
        ownerPrincipalId: collection.ownerPrincipalId,
        displayName: 'sub',
      }),
    );
    const repository = dataSource.getRepository(CollectionChange);
    await repository.save(
      repository.create({
        collectionId: collection.id,
        seq: 1,
        name: 'report.txt',
        action: 'added',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          collectionId: otherCollection.id,
          seq: 1,
          name: 'other.txt',
          action: 'added',
        }),
      ),
    ).resolves.toBeDefined();
  });
});
