import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  Collection,
  CollectionProperty,
  Principal,
  Tenant,
} from './index.js';

describe('CollectionProperty entity', () => {
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

  it('persists a dead property', async () => {
    const repository = dataSource.getRepository(CollectionProperty);
    await repository.save(
      repository.create({
        collectionId: collection.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      }),
    );

    const found = await repository.findOneByOrFail({
      collectionId: collection.id,
      namespace: 'DAV:',
      name: 'custom-prop',
    });
    expect(found.value).toBe('value1');
  });

  it('rejects a duplicate (collectionId, namespace, name) via plain insert', async () => {
    const repository = dataSource.getRepository(CollectionProperty);
    await repository.save(
      repository.create({
        collectionId: collection.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          collectionId: collection.id,
          namespace: 'DAV:',
          name: 'custom-prop',
          value: 'value2',
        }),
      ),
    ).rejects.toThrow();
  });

  it('overwrites the value instead of duplicating when set again (upsert)', async () => {
    const repository = dataSource.getRepository(CollectionProperty);
    await repository.upsert(
      {
        collectionId: collection.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      },
      ['collectionId', 'namespace', 'name'],
    );

    await repository.upsert(
      {
        collectionId: collection.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value2',
      },
      ['collectionId', 'namespace', 'name'],
    );

    const rows = await repository.findBy({
      collectionId: collection.id,
      namespace: 'DAV:',
      name: 'custom-prop',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('value2');
  });
});
