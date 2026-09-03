import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  AddressbookCollection,
  AddressObject,
  AddressObjectProperty,
  Principal,
  Tenant,
} from './index.js';

describe('AddressObjectProperty entity', () => {
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

  it('persists a dead property', async () => {
    const repository = dataSource.getRepository(AddressObjectProperty);
    await repository.save(
      repository.create({
        addressObjectId: addressObject.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      }),
    );

    const found = await repository.findOneByOrFail({
      addressObjectId: addressObject.id,
      namespace: 'DAV:',
      name: 'custom-prop',
    });
    expect(found.value).toBe('value1');
  });

  it('rejects a duplicate (addressObjectId, namespace, name) via plain insert', async () => {
    const repository = dataSource.getRepository(AddressObjectProperty);
    await repository.save(
      repository.create({
        addressObjectId: addressObject.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          addressObjectId: addressObject.id,
          namespace: 'DAV:',
          name: 'custom-prop',
          value: 'value2',
        }),
      ),
    ).rejects.toThrow();
  });

  it('overwrites the value instead of duplicating when set again (upsert)', async () => {
    const repository = dataSource.getRepository(AddressObjectProperty);
    await repository.upsert(
      {
        addressObjectId: addressObject.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      },
      ['addressObjectId', 'namespace', 'name'],
    );

    await repository.upsert(
      {
        addressObjectId: addressObject.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value2',
      },
      ['addressObjectId', 'namespace', 'name'],
    );

    const rows = await repository.findBy({
      addressObjectId: addressObject.id,
      namespace: 'DAV:',
      name: 'custom-prop',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('value2');
  });
});
