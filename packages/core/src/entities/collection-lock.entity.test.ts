import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  Collection,
  CollectionLock,
  Principal,
  Tenant,
} from './index.js';

describe('CollectionLock entity', () => {
  let dataSource: DataSource;
  let collection: Collection;
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
    collection = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: principal.id,
        displayName: 'Root',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists a lock with its scope, depth and owner info', async () => {
    const repository = dataSource.getRepository(CollectionLock);
    const lock = await repository.save(
      repository.create({
        collectionId: collection.id,
        principalId: principal.id,
        token: 'urn:uuid:11111111-1111-1111-1111-111111111111',
        scope: 'exclusive',
        depth: 'infinity',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: '<D:href>mailto:alice@example.com</D:href>',
      }),
    );

    const found = await repository.findOneByOrFail({ id: lock.id });
    expect(found.scope).toBe('exclusive');
    expect(found.depth).toBe('infinity');
    expect(found.ownerInfo).toBe(
      '<D:href>mailto:alice@example.com</D:href>',
    );
  });

  it('leaves expiresAt null for an Infinite lock (null timeoutSeconds)', async () => {
    const repository = dataSource.getRepository(CollectionLock);
    const lock = await repository.save(
      repository.create({
        collectionId: collection.id,
        principalId: principal.id,
        token: 'urn:uuid:22222222-2222-2222-2222-222222222222',
        scope: 'shared',
        depth: 'zero',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );

    const found = await repository.findOneByOrFail({ id: lock.id });
    expect(found.timeoutSeconds).toBeNull();
    expect(found.expiresAt).toBeNull();
  });

  it('round-trips expiresAt computed as createdAt + timeoutSeconds', async () => {
    const repository = dataSource.getRepository(CollectionLock);
    const timeoutSeconds = 3600;
    const saved = await repository.save(
      repository.create({
        collectionId: collection.id,
        principalId: principal.id,
        token: 'urn:uuid:33333333-3333-3333-3333-333333333333',
        scope: 'exclusive',
        depth: 'zero',
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
    const repository = dataSource.getRepository(CollectionLock);
    await repository.save(
      repository.create({
        collectionId: collection.id,
        principalId: principal.id,
        token: 'urn:uuid:44444444-4444-4444-4444-444444444444',
        scope: 'exclusive',
        depth: 'zero',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );

    await expect(
      repository.save(
        repository.create({
          collectionId: collection.id,
          principalId: principal.id,
          token: 'urn:uuid:44444444-4444-4444-4444-444444444444',
          scope: 'shared',
          depth: 'zero',
          timeoutSeconds: null,
          expiresAt: null,
          ownerInfo: null,
        }),
      ),
    ).rejects.toThrow();
  });
});
