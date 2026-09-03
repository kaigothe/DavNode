import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  AddressbookCollection,
  AddressObject,
  AddressObjectIndex,
  Principal,
  Tenant,
} from './index.js';

describe('AddressObjectIndex entity', () => {
  let dataSource: DataSource;
  let addressObject: AddressObject;

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
    const addressbook = await dataSource
      .getRepository(AddressbookCollection)
      .save(
        dataSource.getRepository(AddressbookCollection).create({
          tenantId: tenant.id,
          ownerPrincipalId: ownerPrincipal.id,
          displayName: 'Contacts',
        }),
      );
    addressObject = await dataSource.getRepository(AddressObject).save(
      dataSource.getRepository(AddressObject).create({
        tenantId: tenant.id,
        addressbookId: addressbook.id,
        name: 'contact.vcf',
        uid: 'uid-1',
        etag: 'etag-1',
        ownerPrincipalId: ownerPrincipal.id,
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists several index rows for the same address object and property name', async () => {
    const repository = dataSource.getRepository(AddressObjectIndex);
    await repository.save([
      repository.create({
        addressObjectId: addressObject.id,
        propertyName: 'EMAIL',
        propertyValue: 'forrest@example.com',
      }),
      repository.create({
        addressObjectId: addressObject.id,
        propertyName: 'EMAIL',
        propertyValue: 'forrest@home.example.com',
      }),
    ]);

    const rows = await repository.findBy({
      addressObjectId: addressObject.id,
      propertyName: 'EMAIL',
    });
    expect(rows).toHaveLength(2);
  });

  it('deletes its index rows when the address object is deleted', async () => {
    const repository = dataSource.getRepository(AddressObjectIndex);
    await repository.save(
      repository.create({
        addressObjectId: addressObject.id,
        propertyName: 'FN',
        propertyValue: 'forrest gump',
      }),
    );

    await dataSource
      .getRepository(AddressObject)
      .delete({ id: addressObject.id });

    const remaining = await repository.findBy({
      addressObjectId: addressObject.id,
    });
    expect(remaining).toHaveLength(0);
  });
});
