import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../../db/data-source.js';
import {
  ALL_ENTITIES,
  Collection,
  CollectionLock,
  FileLock,
  FileResource,
  Principal,
  Tenant,
} from '../../entities/index.js';
import { ALL_MIGRATIONS } from '../../migrations/sqlite/index.js';
import { getEffectiveLocks } from './collect-locks.js';

describe('getEffectiveLocks', () => {
  let dataSource: DataSource;
  let principal: Principal;
  let root: Collection;

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
    root = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: principal.id,
        displayName: 'root',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function subCollection(
    parentCollectionId: string,
    displayName: string,
  ): Promise<Collection> {
    return dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: root.tenantId,
        parentCollectionId,
        ownerPrincipalId: principal.id,
        displayName,
      }),
    );
  }

  async function file(
    collectionId: string,
    name: string,
  ): Promise<FileResource> {
    return dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: root.tenantId,
        collectionId,
        name,
        contentType: 'text/plain',
        etag: 'etag-1',
        sizeBytes: 1,
        ownerPrincipalId: principal.id,
      }),
    );
  }

  let nextTokenSuffix = 1;
  function nextToken(): string {
    const suffix = String(nextTokenSuffix++).padStart(12, '0');
    return `urn:uuid:00000000-0000-0000-0000-${suffix}`;
  }

  async function collectionLock(
    collectionId: string,
    overrides: Partial<{
      scope: 'exclusive' | 'shared';
      depth: 'zero' | 'infinity';
      expiresAt: Date | null;
      token: string;
    }> = {},
  ): Promise<CollectionLock> {
    return dataSource.getRepository(CollectionLock).save(
      dataSource.getRepository(CollectionLock).create({
        collectionId,
        principalId: principal.id,
        token: overrides.token ?? nextToken(),
        scope: overrides.scope ?? 'exclusive',
        depth: overrides.depth ?? 'infinity',
        timeoutSeconds: null,
        expiresAt: overrides.expiresAt ?? null,
        ownerInfo: null,
      }),
    );
  }

  async function fileLock(
    fileResourceId: string,
    overrides: Partial<{
      scope: 'exclusive' | 'shared';
      expiresAt: Date | null;
      token: string;
    }> = {},
  ): Promise<FileLock> {
    return dataSource.getRepository(FileLock).save(
      dataSource.getRepository(FileLock).create({
        fileResourceId,
        principalId: principal.id,
        token: overrides.token ?? nextToken(),
        scope: overrides.scope ?? 'exclusive',
        timeoutSeconds: null,
        expiresAt: overrides.expiresAt ?? null,
        ownerInfo: null,
      }),
    );
  }

  it('a depth:infinity lock on a collection applies to a file two levels below', async () => {
    const a = await subCollection(root.id, 'a');
    const b = await subCollection(a.id, 'b');
    const doc = await file(b.id, 'doc.txt');
    const lock = await collectionLock(a.id, { depth: 'infinity' });

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveLocks(manager, doc),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: lock.id,
        inherited: true,
        inheritedFrom: a.id,
      }),
    ]);
  });

  it('a depth:zero lock on a collection does not apply to its children', async () => {
    const a = await subCollection(root.id, 'a');
    const doc = await file(a.id, 'doc.txt');
    await collectionLock(a.id, { depth: 'zero' });

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveLocks(manager, doc),
    );

    expect(result).toEqual([]);
  });

  it('a depth:zero lock still applies directly to the collection it is on', async () => {
    const a = await subCollection(root.id, 'a');
    const lock = await collectionLock(a.id, { depth: 'zero' });

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveLocks(manager, a),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: lock.id,
        inherited: false,
        inheritedFrom: null,
      }),
    ]);
  });

  it('an expired lock is not returned', async () => {
    const doc = await file(root.id, 'doc.txt');
    await fileLock(doc.id, { expiresAt: new Date(Date.now() - 1000) });

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveLocks(manager, doc),
    );

    expect(result).toEqual([]);
  });

  it('a not-yet-expired lock is still returned', async () => {
    const doc = await file(root.id, 'doc.txt');
    const lock = await fileLock(doc.id, {
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveLocks(manager, doc),
    );

    expect(result).toEqual([expect.objectContaining({ id: lock.id })]);
  });

  it('an Infinite lock (null expiresAt) is always returned', async () => {
    const doc = await file(root.id, 'doc.txt');
    const lock = await fileLock(doc.id, { expiresAt: null });

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveLocks(manager, doc),
    );

    expect(result).toEqual([expect.objectContaining({ id: lock.id })]);
  });

  it('combines a file’s own direct lock with an inherited ancestor lock', async () => {
    const a = await subCollection(root.id, 'a');
    const doc = await file(a.id, 'doc.txt');
    const ownLock = await fileLock(doc.id);
    const ancestorLock = await collectionLock(a.id, { depth: 'infinity' });

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveLocks(manager, doc),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: ownLock.id,
        inherited: false,
        inheritedFrom: null,
      }),
      expect.objectContaining({
        id: ancestorLock.id,
        inherited: true,
        inheritedFrom: a.id,
      }),
    ]);
  });
});
