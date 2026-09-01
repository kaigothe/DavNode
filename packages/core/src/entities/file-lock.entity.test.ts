import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  Collection,
  FileLock,
  FileResource,
  Principal,
  Tenant,
} from './index.js';

describe('FileLock entity', () => {
  let dataSource: DataSource;
  let file: FileResource;
  let principal: Principal;

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
    principal = await dataSource
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
        ownerPrincipalId: principal.id,
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
        ownerPrincipalId: principal.id,
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists a lock with its scope and owner info', async () => {
    const repository = dataSource.getRepository(FileLock);
    const lock = await repository.save(
      repository.create({
        fileResourceId: file.id,
        principalId: principal.id,
        token: 'urn:uuid:55555555-5555-5555-5555-555555555555',
        scope: 'exclusive',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: '<D:href>mailto:alice@example.com</D:href>',
      }),
    );

    const found = await repository.findOneByOrFail({ id: lock.id });
    expect(found.scope).toBe('exclusive');
    expect(found.ownerInfo).toBe(
      '<D:href>mailto:alice@example.com</D:href>',
    );
  });

  it('allows two shared locks on the same file', async () => {
    const repository = dataSource.getRepository(FileLock);
    await repository.save(
      repository.create({
        fileResourceId: file.id,
        principalId: principal.id,
        token: 'urn:uuid:66666666-6666-6666-6666-666666666666',
        scope: 'shared',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );
    await repository.save(
      repository.create({
        fileResourceId: file.id,
        principalId: principal.id,
        token: 'urn:uuid:77777777-7777-7777-7777-777777777777',
        scope: 'shared',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );

    const locks = await repository.findBy({ fileResourceId: file.id });
    expect(locks).toHaveLength(2);
  });

  it('round-trips expiresAt computed as createdAt + timeoutSeconds', async () => {
    const repository = dataSource.getRepository(FileLock);
    const timeoutSeconds = 60;
    const saved = await repository.save(
      repository.create({
        fileResourceId: file.id,
        principalId: principal.id,
        token: 'urn:uuid:88888888-8888-8888-8888-888888888888',
        scope: 'exclusive',
        timeoutSeconds,
        expiresAt: null,
        ownerInfo: null,
      }),
    );
    const expiresAt = new Date(
      saved.createdAt.getTime() + timeoutSeconds * 1000,
    );
    saved.expiresAt = expiresAt;
    await repository.save(saved);

    const found = await repository.findOneByOrFail({ id: saved.id });
    expect(found.expiresAt?.getTime()).toBe(expiresAt.getTime());
  });

  it('rejects a second lock reusing an existing token', async () => {
    const repository = dataSource.getRepository(FileLock);
    await repository.save(
      repository.create({
        fileResourceId: file.id,
        principalId: principal.id,
        token: 'urn:uuid:99999999-9999-9999-9999-999999999999',
        scope: 'exclusive',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );

    await expect(
      repository.save(
        repository.create({
          fileResourceId: file.id,
          principalId: principal.id,
          token: 'urn:uuid:99999999-9999-9999-9999-999999999999',
          scope: 'shared',
          timeoutSeconds: null,
          expiresAt: null,
          ownerInfo: null,
        }),
      ),
    ).rejects.toThrow();
  });
});
