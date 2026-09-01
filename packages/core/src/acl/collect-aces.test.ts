import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  Collection,
  CollectionAce,
  FileAce,
  FileResource,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { collectWebDavAces } from './collect-aces.js';

describe('collectWebDavAces', () => {
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

  async function collectionAce(
    collectionId: string,
    position: number,
  ): Promise<CollectionAce> {
    return dataSource.getRepository(CollectionAce).save(
      dataSource.getRepository(CollectionAce).create({
        collectionId,
        principalId: principal.id,
        privilege: 'read',
        grantDeny: 'grant',
        position,
      }),
    );
  }

  async function fileAce(
    fileResourceId: string,
    position: number,
  ): Promise<FileAce> {
    return dataSource.getRepository(FileAce).save(
      dataSource.getRepository(FileAce).create({
        fileResourceId,
        principalId: principal.id,
        privilege: 'write',
        grantDeny: 'grant',
        position,
      }),
    );
  }

  it('a file without own ACEs gets exactly its parent collection ACEs, marked inherited', async () => {
    const sub = await subCollection(root.id, 'sub');
    const subAce1 = await collectionAce(sub.id, 0);
    const subAce2 = await collectionAce(sub.id, 1);
    const doc = await file(sub.id, 'doc.txt');

    const result = await dataSource.manager.transaction((manager) =>
      collectWebDavAces(manager, doc),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: subAce1.id,
        inherited: true,
        inheritedFrom: sub.id,
      }),
      expect.objectContaining({
        id: subAce2.id,
        inherited: true,
        inheritedFrom: sub.id,
      }),
    ]);
  });

  it('a file with its own ACEs gets both: own first (inherited: false), then inherited', async () => {
    const sub = await subCollection(root.id, 'sub');
    const subAce = await collectionAce(sub.id, 0);
    const doc = await file(sub.id, 'doc.txt');
    const ownAce = await fileAce(doc.id, 0);

    const result = await dataSource.manager.transaction((manager) =>
      collectWebDavAces(manager, doc),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: ownAce.id,
        inherited: false,
        inheritedFrom: null,
      }),
      expect.objectContaining({
        id: subAce.id,
        inherited: true,
        inheritedFrom: sub.id,
      }),
    ]);
  });

  it('inheritance works across three nested collection levels', async () => {
    const a = await subCollection(root.id, 'a');
    const b = await subCollection(a.id, 'b');
    const c = await subCollection(b.id, 'c');
    const aceA = await collectionAce(a.id, 0);
    const aceB = await collectionAce(b.id, 0);
    const aceC = await collectionAce(c.id, 0);
    const doc = await file(c.id, 'doc.txt');

    const result = await dataSource.manager.transaction((manager) =>
      collectWebDavAces(manager, doc),
    );

    expect(result.map((ace) => ace.id)).toEqual([aceC.id, aceB.id, aceA.id]);
    expect(result.every((ace) => ace.inherited)).toBe(true);
  });

  it('the returned order is deterministic: own ACEs by position, then nearest ancestor first, each by its own position', async () => {
    const a = await subCollection(root.id, 'a');
    const b = await subCollection(a.id, 'b');
    const aAce0 = await collectionAce(a.id, 0);
    const aAce1 = await collectionAce(a.id, 1);
    const bAce1 = await collectionAce(b.id, 1);
    const bAce0 = await collectionAce(b.id, 0);
    const doc = await file(b.id, 'doc.txt');
    const ownAce1 = await fileAce(doc.id, 1);
    const ownAce0 = await fileAce(doc.id, 0);

    const result = await dataSource.manager.transaction((manager) =>
      collectWebDavAces(manager, doc),
    );

    expect(result.map((ace) => ace.id)).toEqual([
      ownAce0.id,
      ownAce1.id,
      bAce0.id,
      bAce1.id,
      aAce0.id,
      aAce1.id,
    ]);
  });
});
