import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  AddressbookCollection,
  AddressObject,
  AddressObjectContent,
  Principal,
  Tenant,
} from './index.js';

describe('AddressObject / AddressObjectContent entities', () => {
  let dataSource: DataSource;
  let addressbook: AddressbookCollection;
  let ownerPrincipal: Principal;

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
    ownerPrincipal = await dataSource
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

  async function createAddressObject(
    uid: string,
    addressbookId: string = addressbook.id,
  ): Promise<AddressObject> {
    const repository = dataSource.getRepository(AddressObject);
    return repository.save(
      repository.create({
        tenantId: addressbook.tenantId,
        addressbookId,
        uid,
        etag: 'etag-1',
        ownerPrincipalId: ownerPrincipal.id,
      }),
    );
  }

  it('persists an address object and its content together', async () => {
    const addressObject = await createAddressObject('uid-1');
    await dataSource.getRepository(AddressObjectContent).save(
      dataSource.getRepository(AddressObjectContent).create({
        addressObjectId: addressObject.id,
        vcardData: 'BEGIN:VCARD\r\nEND:VCARD\r\n',
      }),
    );

    const foundContent = await dataSource
      .getRepository(AddressObjectContent)
      .findOneByOrFail({ addressObjectId: addressObject.id });
    expect(foundContent.vcardData).toBe('BEGIN:VCARD\r\nEND:VCARD\r\n');
  });

  it('rejects a duplicate UID within the same addressbook', async () => {
    await createAddressObject('uid-1');

    await expect(createAddressObject('uid-1')).rejects.toThrow();
  });

  it('allows the same UID in a different addressbook', async () => {
    await createAddressObject('uid-1');

    const otherAddressbook = await dataSource
      .getRepository(AddressbookCollection)
      .save(
        dataSource.getRepository(AddressbookCollection).create({
          tenantId: addressbook.tenantId,
          ownerPrincipalId: ownerPrincipal.id,
          displayName: 'Work',
        }),
      );

    await expect(
      createAddressObject('uid-1', otherAddressbook.id),
    ).resolves.toBeDefined();
  });

  it('deletes the address object content when the address object is deleted', async () => {
    const addressObject = await createAddressObject('uid-1');
    await dataSource.getRepository(AddressObjectContent).save(
      dataSource.getRepository(AddressObjectContent).create({
        addressObjectId: addressObject.id,
        vcardData: 'BEGIN:VCARD\r\nEND:VCARD\r\n',
      }),
    );

    await dataSource.getRepository(AddressObject).delete({
      id: addressObject.id,
    });

    const remaining = await dataSource
      .getRepository(AddressObjectContent)
      .findBy({ addressObjectId: addressObject.id });
    expect(remaining).toHaveLength(0);
  });
});
