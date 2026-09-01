import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../../db/data-source.js';
import { CollectionProperty } from '../../entities/collection-property.entity.js';
import { FileProperty } from '../../entities/file-property.entity.js';
import {
  ALL_ENTITIES,
  Collection,
  FileResource,
  Principal,
  Tenant,
} from '../../entities/index.js';
import { ALL_MIGRATIONS } from '../../migrations/sqlite/index.js';
import type { ProppatchOperation } from '../xml/request-parser.js';
import { DeadPropertyService } from './dead-property.service.js';

describe('DeadPropertyService', () => {
  let dataSource: DataSource;
  let service: DeadPropertyService;
  let collection: Collection;
  let file: FileResource;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new DeadPropertyService(dataSource);

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
        displayName: 'root',
      }),
    );
    file = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: collection.id,
        name: 'report.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 3,
        ownerPrincipalId: ownerPrincipal.id,
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  describe('listForCollection', () => {
    it('returns an empty array when no dead properties are set', async () => {
      expect(await service.listForCollection(collection.id)).toEqual([]);
    });

    it('lists every dead property set on the collection', async () => {
      await dataSource.getRepository(CollectionProperty).save(
        dataSource.getRepository(CollectionProperty).create({
          collectionId: collection.id,
          namespace: 'urn:example:ns',
          name: 'color',
          value: 'blue',
        }),
      );

      const properties = await service.listForCollection(collection.id);

      expect(properties).toEqual([
        { namespace: 'urn:example:ns', name: 'color', value: 'blue' },
      ]);
    });

    it('does not return properties belonging to a different collection', async () => {
      const otherCollection = await dataSource.getRepository(Collection).save(
        dataSource.getRepository(Collection).create({
          tenantId: collection.tenantId,
          parentCollectionId: collection.id,
          ownerPrincipalId: collection.ownerPrincipalId,
          displayName: 'other',
        }),
      );
      await dataSource.getRepository(CollectionProperty).save(
        dataSource.getRepository(CollectionProperty).create({
          collectionId: otherCollection.id,
          namespace: 'urn:example:ns',
          name: 'color',
          value: 'blue',
        }),
      );

      expect(await service.listForCollection(collection.id)).toEqual([]);
    });
  });

  describe('listForFileResource', () => {
    it('returns an empty array when no dead properties are set', async () => {
      expect(await service.listForFileResource(file.id)).toEqual([]);
    });

    it('lists every dead property set on the file resource', async () => {
      await dataSource.getRepository(FileProperty).save(
        dataSource.getRepository(FileProperty).create({
          fileResourceId: file.id,
          namespace: 'urn:example:ns',
          name: 'reviewed',
          value: 'true',
        }),
      );

      const properties = await service.listForFileResource(file.id);

      expect(properties).toEqual([
        { namespace: 'urn:example:ns', name: 'reviewed', value: 'true' },
      ]);
    });
  });

  describe('applyOperations', () => {
    it('creates a new dead property on a collection via set', async () => {
      const operations: ProppatchOperation[] = [
        {
          kind: 'set',
          property: { namespace: 'urn:example:ns', name: 'color' },
          value: 'blue',
        },
      ];

      await service.applyOperations(collection, operations);

      expect(await service.listForCollection(collection.id)).toEqual([
        { namespace: 'urn:example:ns', name: 'color', value: 'blue' },
      ]);
    });

    it('creates a new dead property on a file resource via set', async () => {
      const operations: ProppatchOperation[] = [
        {
          kind: 'set',
          property: { namespace: 'urn:example:ns', name: 'reviewed' },
          value: 'true',
        },
      ];

      await service.applyOperations(file, operations);

      expect(await service.listForFileResource(file.id)).toEqual([
        { namespace: 'urn:example:ns', name: 'reviewed', value: 'true' },
      ]);
    });

    it('overwrites an existing value in place, without creating a duplicate row', async () => {
      const property = { namespace: 'urn:example:ns', name: 'color' };
      await service.applyOperations(collection, [
        { kind: 'set', property, value: 'blue' },
      ]);

      await service.applyOperations(collection, [
        { kind: 'set', property, value: 'green' },
      ]);

      expect(await service.listForCollection(collection.id)).toEqual([
        { namespace: 'urn:example:ns', name: 'color', value: 'green' },
      ]);
      const rows = await dataSource
        .getRepository(CollectionProperty)
        .findBy({ collectionId: collection.id });
      expect(rows).toHaveLength(1);
    });

    it('removes an existing dead property', async () => {
      const property = { namespace: 'urn:example:ns', name: 'color' };
      await service.applyOperations(collection, [
        { kind: 'set', property, value: 'blue' },
      ]);

      await service.applyOperations(collection, [{ kind: 'remove', property }]);

      expect(await service.listForCollection(collection.id)).toEqual([]);
    });

    it('treats removing a never-set property as a no-op, not an error', async () => {
      await expect(
        service.applyOperations(collection, [
          {
            kind: 'remove',
            property: { namespace: 'urn:example:ns', name: 'never-set' },
          },
        ]),
      ).resolves.toBeUndefined();

      expect(await service.listForCollection(collection.id)).toEqual([]);
    });

    it('applies multiple operations in one call', async () => {
      await service.applyOperations(collection, [
        {
          kind: 'set',
          property: { namespace: 'urn:example:ns', name: 'color' },
          value: 'blue',
        },
        {
          kind: 'set',
          property: { namespace: 'urn:example:ns', name: 'size' },
          value: 'large',
        },
      ]);

      const properties = await service.listForCollection(collection.id);
      expect(properties).toEqual(
        expect.arrayContaining([
          { namespace: 'urn:example:ns', name: 'color', value: 'blue' },
          { namespace: 'urn:example:ns', name: 'size', value: 'large' },
        ]),
      );
    });
  });
});
