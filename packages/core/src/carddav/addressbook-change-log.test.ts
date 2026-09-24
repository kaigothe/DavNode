import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  AddressbookCollection,
  Collection,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { CollectionChangeService } from '../webdav/collection-change.service.js';
import { CollectionChangeLog } from '../webdav/sync/change-log.js';
import { AddressbookChangeLog } from './addressbook-change-log.js';
import { AddressbookChangeService } from './addressbook-change.service.js';

describe('ChangeLogRepository implementations', () => {
  let dataSource: DataSource;
  let addressbook: AddressbookCollection;
  let otherAddressbook: AddressbookCollection;
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
    const principal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    const newAddressbook = (
      displayName: string,
    ): Promise<AddressbookCollection> =>
      dataSource.getRepository(AddressbookCollection).save(
        dataSource.getRepository(AddressbookCollection).create({
          tenantId: tenant.id,
          ownerPrincipalId: principal.id,
          displayName,
        }),
      );
    addressbook = await newAddressbook('Contacts');
    otherAddressbook = await newAddressbook('Other');
    collection = await dataSource.getRepository(Collection).save(
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

  it('AddressbookChangeLog returns only changes after the given seq, in seq order', async () => {
    const service = new AddressbookChangeService();
    await dataSource.transaction(async (manager) => {
      await service.recordChange(manager, addressbook.id, 'a.vcf', 'added');
      await service.recordChange(manager, addressbook.id, 'b.vcf', 'added');
      await service.recordChange(manager, addressbook.id, 'a.vcf', 'deleted');
    });

    const result = await new AddressbookChangeLog().loadChangesSince(
      dataSource.manager,
      addressbook.id,
      1,
    );

    expect(result).toEqual([
      { name: 'b.vcf', action: 'added', seq: 2 },
      { name: 'a.vcf', action: 'deleted', seq: 3 },
    ]);
  });

  it('AddressbookChangeLog never returns another addressbook’s changes', async () => {
    const service = new AddressbookChangeService();
    await dataSource.transaction(async (manager) => {
      await service.recordChange(manager, addressbook.id, 'a.vcf', 'added');
      await service.recordChange(
        manager,
        otherAddressbook.id,
        'x.vcf',
        'added',
      );
    });

    const result = await new AddressbookChangeLog().loadChangesSince(
      dataSource.manager,
      addressbook.id,
      0,
    );

    expect(result.map((entry) => entry.name)).toEqual(['a.vcf']);
  });

  it('AddressbookChangeLog returns nothing when the seq is already current', async () => {
    const service = new AddressbookChangeService();
    await dataSource.transaction((manager) =>
      service.recordChange(manager, addressbook.id, 'a.vcf', 'added'),
    );

    const result = await new AddressbookChangeLog().loadChangesSince(
      dataSource.manager,
      addressbook.id,
      1,
    );

    expect(result).toEqual([]);
  });

  it('CollectionChangeLog reads collection_changes with the same contract', async () => {
    const service = new CollectionChangeService();
    await dataSource.transaction(async (manager) => {
      await service.recordChange(manager, collection.id, 'a.txt', 'added');
      await service.recordChange(manager, collection.id, 'a.txt', 'modified');
    });

    const result = await new CollectionChangeLog().loadChangesSince(
      dataSource.manager,
      collection.id,
      1,
    );

    expect(result).toEqual([{ name: 'a.txt', action: 'modified', seq: 2 }]);
  });
});
