import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  Collection,
  FileResource,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { ResourcePathResolver } from './resource-path-resolver.js';

describe('ResourcePathResolver', () => {
  let dataSource: DataSource;
  let resolver: ResourcePathResolver;
  let tenantId: string;
  let ownerPrincipalId: string;
  let root: Collection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    resolver = new ResourcePathResolver(dataSource);

    const tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    tenantId = tenant.id;
    const ownerPrincipal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId, kind: 'user', specialKind: null }),
      );
    ownerPrincipalId = ownerPrincipal.id;
    root = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId,
        parentCollectionId: null,
        ownerPrincipalId,
        displayName: 'root',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('resolves an empty segment list to the tenant root collection', async () => {
    const resolved = await resolver.resolve(tenantId, []);

    expect(resolved).toBeInstanceOf(Collection);
    expect((resolved as Collection).id).toBe(root.id);
  });

  it('resolves a single segment to a direct child collection', async () => {
    const sub = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId,
        parentCollectionId: root.id,
        ownerPrincipalId,
        displayName: 'sub',
      }),
    );

    const resolved = await resolver.resolve(tenantId, ['sub']);

    expect(resolved).toBeInstanceOf(Collection);
    expect((resolved as Collection).id).toBe(sub.id);
  });

  it('resolves a single segment to a direct child file resource', async () => {
    const file = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId,
        collectionId: root.id,
        name: 'report.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 3,
        ownerPrincipalId,
      }),
    );

    const resolved = await resolver.resolve(tenantId, ['report.txt']);

    expect(resolved).toBeInstanceOf(FileResource);
    expect((resolved as FileResource).id).toBe(file.id);
  });

  it('resolves a nested path through multiple collections to a file resource', async () => {
    const sub = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId,
        parentCollectionId: root.id,
        ownerPrincipalId,
        displayName: 'sub',
      }),
    );
    const file = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId,
        collectionId: sub.id,
        name: 'nested.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 3,
        ownerPrincipalId,
      }),
    );

    const resolved = await resolver.resolve(tenantId, ['sub', 'nested.txt']);

    expect(resolved).toBeInstanceOf(FileResource);
    expect((resolved as FileResource).id).toBe(file.id);
  });

  it('returns null for a path whose intermediate segment does not exist', async () => {
    const resolved = await resolver.resolve(tenantId, [
      'no-such-collection',
      'nested.txt',
    ]);

    expect(resolved).toBeNull();
  });

  it('returns null for a path whose final segment does not exist', async () => {
    const resolved = await resolver.resolve(tenantId, ['no-such-name']);

    expect(resolved).toBeNull();
  });

  it('returns null for a path that tries to descend through a file resource', async () => {
    await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId,
        collectionId: root.id,
        name: 'report.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 3,
        ownerPrincipalId,
      }),
    );

    const resolved = await resolver.resolve(tenantId, [
      'report.txt',
      'nested.txt',
    ]);

    expect(resolved).toBeNull();
  });

  describe('listChildren', () => {
    it('lists both sub-collections and file resources', async () => {
      const sub = await dataSource.getRepository(Collection).save(
        dataSource.getRepository(Collection).create({
          tenantId,
          parentCollectionId: root.id,
          ownerPrincipalId,
          displayName: 'sub',
        }),
      );
      const file = await dataSource.getRepository(FileResource).save(
        dataSource.getRepository(FileResource).create({
          tenantId,
          collectionId: root.id,
          name: 'report.txt',
          contentType: 'text/plain',
          etag: '"1"',
          sizeBytes: 3,
          ownerPrincipalId,
        }),
      );

      const children = await resolver.listChildren(root);

      expect(children).toHaveLength(2);
      expect(
        children.some((c) => c instanceof Collection && c.id === sub.id),
      ).toBe(true);
      expect(
        children.some((c) => c instanceof FileResource && c.id === file.id),
      ).toBe(true);
    });

    it('returns an empty array for a collection with no children', async () => {
      const children = await resolver.listChildren(root);

      expect(children).toEqual([]);
    });
  });
});
