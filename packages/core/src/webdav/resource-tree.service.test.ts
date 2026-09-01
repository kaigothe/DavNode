import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { CollectionProperty } from '../entities/collection-property.entity.js';
import { FileContent } from '../entities/file-content.entity.js';
import { FileProperty } from '../entities/file-property.entity.js';
import {
  ALL_ENTITIES,
  Collection,
  FileResource,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { ResourceTreeService } from './resource-tree.service.js';

describe('ResourceTreeService', () => {
  let dataSource: DataSource;
  let service: ResourceTreeService;
  let tenantId: string;
  let ownerPrincipalId: string;
  let otherPrincipalId: string;
  let root: Collection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new ResourceTreeService();

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
    const otherPrincipal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId, kind: 'user', specialKind: null }),
      );
    otherPrincipalId = otherPrincipal.id;
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

  async function createFile(
    collectionId: string,
    name: string,
    content: string,
  ): Promise<FileResource> {
    const file = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId,
        collectionId,
        name,
        contentType: 'text/plain',
        etag: `"${name}"`,
        sizeBytes: content.length,
        ownerPrincipalId,
      }),
    );
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: file.id,
        data: Buffer.from(content),
      }),
    );
    return file;
  }

  describe('deleteRecursively', () => {
    it('deletes a single file resource and its content', async () => {
      const file = await createFile(root.id, 'report.txt', 'hello');

      await dataSource.transaction((manager) =>
        service.deleteRecursively(manager, file),
      );

      expect(
        await dataSource.getRepository(FileResource).findBy({ id: file.id }),
      ).toEqual([]);
      expect(
        await dataSource
          .getRepository(FileContent)
          .findBy({ fileResourceId: file.id }),
      ).toEqual([]);
    });

    it('recursively deletes a collection subtree', async () => {
      const sub = await dataSource.getRepository(Collection).save(
        dataSource.getRepository(Collection).create({
          tenantId,
          parentCollectionId: root.id,
          ownerPrincipalId,
          displayName: 'sub',
        }),
      );
      const nested = await dataSource.getRepository(Collection).save(
        dataSource.getRepository(Collection).create({
          tenantId,
          parentCollectionId: sub.id,
          ownerPrincipalId,
          displayName: 'nested',
        }),
      );
      await createFile(nested.id, 'deep.txt', 'x');

      await dataSource.transaction((manager) =>
        service.deleteRecursively(manager, sub),
      );

      expect(
        await dataSource.getRepository(Collection).findBy({ id: sub.id }),
      ).toEqual([]);
      expect(
        await dataSource.getRepository(Collection).findBy({ id: nested.id }),
      ).toEqual([]);
      expect(
        await dataSource
          .getRepository(FileResource)
          .findBy({ collectionId: nested.id }),
      ).toEqual([]);
    });
  });

  describe('copyRecursively', () => {
    it('copies a file resource: new owner, copied content, recomputed (matching) ETag', async () => {
      const source = await createFile(root.id, 'report.txt', 'hello');
      await dataSource.getRepository(FileProperty).save(
        dataSource.getRepository(FileProperty).create({
          fileResourceId: source.id,
          namespace: 'urn:example:ns',
          name: 'reviewed',
          value: 'true',
        }),
      );

      const copy = (await dataSource.transaction((manager) =>
        service.copyRecursively(
          manager,
          source,
          root.id,
          'copy.txt',
          otherPrincipalId,
          true,
        ),
      )) as FileResource;

      expect(copy.id).not.toBe(source.id);
      expect(copy.name).toBe('copy.txt');
      expect(copy.ownerPrincipalId).toBe(otherPrincipalId);
      expect(copy.etag).toBe(
        createHash('sha256').update('hello').digest('hex'),
      );

      const copyContent = await dataSource
        .getRepository(FileContent)
        .findOneByOrFail({ fileResourceId: copy.id });
      expect(Buffer.from(copyContent.data).toString('utf8')).toBe('hello');

      const copyProperties = await dataSource
        .getRepository(FileProperty)
        .findBy({ fileResourceId: copy.id });
      expect(copyProperties).toEqual([
        expect.objectContaining({
          namespace: 'urn:example:ns',
          name: 'reviewed',
          value: 'true',
        }),
      ]);

      // The source is untouched.
      const reloadedSource = await dataSource
        .getRepository(FileResource)
        .findOneByOrFail({ id: source.id });
      expect(reloadedSource.ownerPrincipalId).toBe(ownerPrincipalId);
    });

    it('copies a collection with Depth: 0 as an empty collection', async () => {
      const source = await dataSource.getRepository(Collection).save(
        dataSource.getRepository(Collection).create({
          tenantId,
          parentCollectionId: root.id,
          ownerPrincipalId,
          displayName: 'sub',
        }),
      );
      await createFile(source.id, 'a.txt', 'a');

      const copy = (await dataSource.transaction((manager) =>
        service.copyRecursively(
          manager,
          source,
          root.id,
          'sub-copy',
          otherPrincipalId,
          false,
        ),
      )) as Collection;

      expect(copy.displayName).toBe('sub-copy');
      expect(copy.ownerPrincipalId).toBe(otherPrincipalId);
      expect(
        await dataSource
          .getRepository(FileResource)
          .findBy({ collectionId: copy.id }),
      ).toEqual([]);
    });

    it('recursively copies a collection subtree, including dead properties', async () => {
      const source = await dataSource.getRepository(Collection).save(
        dataSource.getRepository(Collection).create({
          tenantId,
          parentCollectionId: root.id,
          ownerPrincipalId,
          displayName: 'sub',
        }),
      );
      await dataSource.getRepository(CollectionProperty).save(
        dataSource.getRepository(CollectionProperty).create({
          collectionId: source.id,
          namespace: 'urn:example:ns',
          name: 'color',
          value: 'blue',
        }),
      );
      const nested = await dataSource.getRepository(Collection).save(
        dataSource.getRepository(Collection).create({
          tenantId,
          parentCollectionId: source.id,
          ownerPrincipalId,
          displayName: 'nested',
        }),
      );
      await createFile(source.id, 'top.txt', 'top');
      await createFile(nested.id, 'deep.txt', 'deep');

      const copy = (await dataSource.transaction((manager) =>
        service.copyRecursively(
          manager,
          source,
          root.id,
          'sub-copy',
          otherPrincipalId,
          true,
        ),
      )) as Collection;

      const copyProperties = await dataSource
        .getRepository(CollectionProperty)
        .findBy({ collectionId: copy.id });
      expect(copyProperties).toEqual([
        expect.objectContaining({
          namespace: 'urn:example:ns',
          name: 'color',
          value: 'blue',
        }),
      ]);

      const copiedNested = await dataSource
        .getRepository(Collection)
        .findOneByOrFail({
          parentCollectionId: copy.id,
          displayName: 'nested',
        });
      expect(copiedNested.id).not.toBe(nested.id);
      expect(copiedNested.ownerPrincipalId).toBe(otherPrincipalId);

      const copiedTopFile = await dataSource
        .getRepository(FileResource)
        .findOneByOrFail({ collectionId: copy.id, name: 'top.txt' });
      expect(copiedTopFile.ownerPrincipalId).toBe(otherPrincipalId);
      const copiedDeepFile = await dataSource
        .getRepository(FileResource)
        .findOneByOrFail({ collectionId: copiedNested.id, name: 'deep.txt' });
      expect(copiedDeepFile.ownerPrincipalId).toBe(otherPrincipalId);

      // The source subtree is untouched.
      expect(
        await dataSource.getRepository(Collection).findBy({ id: source.id }),
      ).toHaveLength(1);
      expect(
        await dataSource.getRepository(Collection).findBy({ id: nested.id }),
      ).toHaveLength(1);
    });
  });
});
