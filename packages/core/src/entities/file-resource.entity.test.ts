import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  Collection,
  FileContent,
  FileResource,
  Principal,
  Tenant,
} from './index.js';

describe('FileResource / FileContent entities', () => {
  let dataSource: DataSource;
  let collection: Collection;
  let ownerPrincipal: Principal;

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
    ownerPrincipal = await dataSource
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

  async function createFile(name: string): Promise<FileResource> {
    const repository = dataSource.getRepository(FileResource);
    return repository.save(
      repository.create({
        tenantId: collection.tenantId,
        collectionId: collection.id,
        name,
        contentType: 'text/plain',
        etag: 'etag-1',
        sizeBytes: 5,
        ownerPrincipalId: ownerPrincipal.id,
      }),
    );
  }

  it('persists a file resource and its content together', async () => {
    const file = await createFile('doc.txt');
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: file.id,
        data: Buffer.from('hello'),
      }),
    );

    const foundContent = await dataSource
      .getRepository(FileContent)
      .findOneByOrFail({ fileResourceId: file.id });
    expect(Buffer.from(foundContent.data).toString('utf8')).toBe('hello');
  });

  it('rejects a duplicate file name within the same collection', async () => {
    await createFile('doc.txt');

    await expect(createFile('doc.txt')).rejects.toThrow();
  });

  it('allows the same file name in a different collection', async () => {
    await createFile('doc.txt');

    const otherCollection = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: collection.tenantId,
        parentCollectionId: collection.id,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'Subfolder',
      }),
    );
    const repository = dataSource.getRepository(FileResource);

    await expect(
      repository.save(
        repository.create({
          tenantId: collection.tenantId,
          collectionId: otherCollection.id,
          name: 'doc.txt',
          contentType: 'text/plain',
          etag: 'etag-1',
          sizeBytes: 5,
          ownerPrincipalId: ownerPrincipal.id,
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('deletes the file content when the file resource is deleted', async () => {
    const file = await createFile('doc.txt');
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: file.id,
        data: Buffer.from('hello'),
      }),
    );

    await dataSource.getRepository(FileResource).delete({ id: file.id });

    const remaining = await dataSource
      .getRepository(FileContent)
      .findBy({ fileResourceId: file.id });
    expect(remaining).toHaveLength(0);
  });
});
