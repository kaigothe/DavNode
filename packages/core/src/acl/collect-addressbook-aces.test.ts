import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  AddressbookAce,
  AddressbookCollection,
  AddressObject,
  AddressObjectAce,
  ALL_ENTITIES,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { collectAddressbookAces } from './collect-aces.js';

describe('collectAddressbookAces', () => {
  let dataSource: DataSource;
  let principal: Principal;
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
    principal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    addressbook = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: principal.id,
        displayName: 'Contacts',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function addressObject(name: string): Promise<AddressObject> {
    return dataSource.getRepository(AddressObject).save(
      dataSource.getRepository(AddressObject).create({
        tenantId: addressbook.tenantId,
        addressbookId: addressbook.id,
        name,
        uid: `uid-${name}`,
        etag: 'etag-1',
        ownerPrincipalId: principal.id,
      }),
    );
  }

  async function addressbookAce(position: number): Promise<AddressbookAce> {
    return dataSource.getRepository(AddressbookAce).save(
      dataSource.getRepository(AddressbookAce).create({
        addressbookId: addressbook.id,
        principalId: principal.id,
        privilege: 'read',
        grantDeny: 'grant',
        position,
      }),
    );
  }

  async function addressObjectAce(
    addressObjectId: string,
    position: number,
  ): Promise<AddressObjectAce> {
    return dataSource.getRepository(AddressObjectAce).save(
      dataSource.getRepository(AddressObjectAce).create({
        addressObjectId,
        principalId: principal.id,
        privilege: 'write-content',
        grantDeny: 'grant',
        position,
      }),
    );
  }

  it("an AddressbookCollection's own ACEs come back, marked not inherited", async () => {
    const ace0 = await addressbookAce(0);
    const ace1 = await addressbookAce(1);

    const result = await dataSource.manager.transaction((manager) =>
      collectAddressbookAces(manager, addressbook),
    );

    expect(result).toEqual([
      expect.objectContaining({ id: ace0.id, inherited: false }),
      expect.objectContaining({ id: ace1.id, inherited: false }),
    ]);
  });

  it('an AddressObject without its own ACEs gets exactly its addressbook ACEs, marked inherited', async () => {
    const bookAce = await addressbookAce(0);
    const contact = await addressObject('forrest.vcf');

    const result = await dataSource.manager.transaction((manager) =>
      collectAddressbookAces(manager, contact),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: bookAce.id,
        inherited: true,
        inheritedFrom: addressbook.id,
      }),
    ]);
  });

  it('an AddressObject with its own ACEs gets both: own first (inherited: false), then the addressbook (inherited: true)', async () => {
    const bookAce = await addressbookAce(0);
    const contact = await addressObject('forrest.vcf');
    const ownAce = await addressObjectAce(contact.id, 0);

    const result = await dataSource.manager.transaction((manager) =>
      collectAddressbookAces(manager, contact),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: ownAce.id,
        inherited: false,
        inheritedFrom: null,
      }),
      expect.objectContaining({
        id: bookAce.id,
        inherited: true,
        inheritedFrom: addressbook.id,
      }),
    ]);
  });

  it('inheritance stops at the addressbook — there is no second level to walk up to (addressbooks do not nest)', async () => {
    const bookAce = await addressbookAce(0);
    const contact = await addressObject('forrest.vcf');

    const result = await dataSource.manager.transaction((manager) =>
      collectAddressbookAces(manager, contact),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(bookAce.id);
  });
});
