import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  AddressbookChange,
  AddressbookCollection,
  AddressObject,
  Principal,
  Tenant,
} from './index.js';

describe('AddressbookChange entity', () => {
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

  it('persists a change record', async () => {
    const repository = dataSource.getRepository(AddressbookChange);
    const saved = await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        seq: 1,
        name: 'contact.vcf',
        action: 'added',
      }),
    );

    const found = await repository.findOneByOrFail({ id: saved.id });
    expect(found.action).toBe('added');
    expect(found.name).toBe('contact.vcf');
    expect(found.seq).toBe(1);
  });

  it('rejects a duplicate (addressbookId, seq) via plain insert', async () => {
    const repository = dataSource.getRepository(AddressbookChange);
    await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        seq: 1,
        name: 'contact.vcf',
        action: 'added',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          addressbookId: addressbook.id,
          seq: 1,
          name: 'other.vcf',
          action: 'added',
        }),
      ),
    ).rejects.toThrow();
  });

  it('allows the same seq for a different addressbook', async () => {
    const otherAddressbook = await dataSource
      .getRepository(AddressbookCollection)
      .save(
        dataSource.getRepository(AddressbookCollection).create({
          tenantId: addressbook.tenantId,
          ownerPrincipalId: addressbook.ownerPrincipalId,
          displayName: 'Work',
        }),
      );
    const repository = dataSource.getRepository(AddressbookChange);
    await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        seq: 1,
        name: 'contact.vcf',
        action: 'added',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          addressbookId: otherAddressbook.id,
          seq: 1,
          name: 'other.vcf',
          action: 'added',
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('keeps reporting a deletion after the referenced AddressObject row is gone (no live FK)', async () => {
    const addressObject = await dataSource.getRepository(AddressObject).save(
      dataSource.getRepository(AddressObject).create({
        tenantId: addressbook.tenantId,
        addressbookId: addressbook.id,
        name: 'contact.vcf',
        uid: 'uid-1',
        etag: 'etag-1',
        ownerPrincipalId: addressbook.ownerPrincipalId,
      }),
    );
    const repository = dataSource.getRepository(AddressbookChange);
    await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        seq: 1,
        name: addressObject.name,
        action: 'deleted',
      }),
    );

    await dataSource
      .getRepository(AddressObject)
      .delete({ id: addressObject.id });

    const found = await repository.findOneByOrFail({
      addressbookId: addressbook.id,
      seq: 1,
    });
    expect(found.action).toBe('deleted');
    expect(found.name).toBe('contact.vcf');
  });
});
