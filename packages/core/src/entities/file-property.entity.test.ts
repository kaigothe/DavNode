import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  Collection,
  FileProperty,
  FileResource,
  Principal,
  Tenant,
} from './index.js';

describe('FileProperty entity', () => {
  let dataSource: DataSource;
  let file: FileResource;

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
    const collection = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'Root',
      }),
    );
    file = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: collection.id,
        name: 'doc.txt',
        contentType: 'text/plain',
        etag: 'etag-1',
        sizeBytes: 5,
        ownerPrincipalId: ownerPrincipal.id,
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists a dead property', async () => {
    const repository = dataSource.getRepository(FileProperty);
    await repository.save(
      repository.create({
        fileResourceId: file.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      }),
    );

    const found = await repository.findOneByOrFail({
      fileResourceId: file.id,
      namespace: 'DAV:',
      name: 'custom-prop',
    });
    expect(found.value).toBe('value1');
  });

  it('rejects a duplicate (fileResourceId, namespace, name)', async () => {
    const repository = dataSource.getRepository(FileProperty);
    await repository.save(
      repository.create({
        fileResourceId: file.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          fileResourceId: file.id,
          namespace: 'DAV:',
          name: 'custom-prop',
          value: 'value2',
        }),
      ),
    ).rejects.toThrow();
  });

  it('overwrites the value instead of duplicating when set again (upsert)', async () => {
    const repository = dataSource.getRepository(FileProperty);
    await repository.upsert(
      {
        fileResourceId: file.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      },
      ['fileResourceId', 'namespace', 'name'],
    );
    await repository.upsert(
      {
        fileResourceId: file.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value2',
      },
      ['fileResourceId', 'namespace', 'name'],
    );

    const rows = await repository.findBy({
      fileResourceId: file.id,
      namespace: 'DAV:',
      name: 'custom-prop',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('value2');
  });
});
