import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  AddressbookCollection,
  AddressbookProperty,
  Principal,
  Tenant,
} from './index.js';

describe('AddressbookProperty entity', () => {
  let dataSource: DataSource;
  let addressbook: AddressbookCollection;

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
    addressbook = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'Contacts',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists a dead property', async () => {
    const repository = dataSource.getRepository(AddressbookProperty);
    await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      }),
    );

    const found = await repository.findOneByOrFail({
      addressbookId: addressbook.id,
      namespace: 'DAV:',
      name: 'custom-prop',
    });
    expect(found.value).toBe('value1');
  });

  it('rejects a duplicate (addressbookId, namespace, name) via plain insert', async () => {
    const repository = dataSource.getRepository(AddressbookProperty);
    await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          addressbookId: addressbook.id,
          namespace: 'DAV:',
          name: 'custom-prop',
          value: 'value2',
        }),
      ),
    ).rejects.toThrow();
  });

  it('overwrites the value instead of duplicating when set again (upsert)', async () => {
    const repository = dataSource.getRepository(AddressbookProperty);
    await repository.upsert(
      {
        addressbookId: addressbook.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value1',
      },
      ['addressbookId', 'namespace', 'name'],
    );

    await repository.upsert(
      {
        addressbookId: addressbook.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'value2',
      },
      ['addressbookId', 'namespace', 'name'],
    );

    const rows = await repository.findBy({
      addressbookId: addressbook.id,
      namespace: 'DAV:',
      name: 'custom-prop',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('value2');
  });
});
