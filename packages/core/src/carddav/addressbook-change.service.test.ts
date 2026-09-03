import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { AddressbookChange } from '../entities/addressbook-change.entity.js';
import {
  ALL_ENTITIES,
  AddressbookCollection,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { AddressbookChangeService } from './addressbook-change.service.js';

describe('AddressbookChangeService', () => {
  let dataSource: DataSource;
  let service: AddressbookChangeService;
  let addressbook: AddressbookCollection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new AddressbookChangeService();

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

  it('bumps the parent addressbook syncSeq and records a change with the matching seq', async () => {
    await dataSource.transaction(async (manager) => {
      await service.recordChange(
        manager,
        addressbook.id,
        'contact.vcf',
        'added',
      );
    });

    const reloaded = await dataSource
      .getRepository(AddressbookCollection)
      .findOneByOrFail({ id: addressbook.id });
    expect(reloaded.syncSeq).toBe(1);

    const changes = await dataSource
      .getRepository(AddressbookChange)
      .findBy({ addressbookId: addressbook.id });
    expect(changes).toEqual([
      expect.objectContaining({
        addressbookId: addressbook.id,
        seq: 1,
        name: 'contact.vcf',
        action: 'added',
      }),
    ]);
  });

  it('assigns strictly increasing seq numbers across successive changes', async () => {
    await dataSource.transaction((manager) =>
      service.recordChange(manager, addressbook.id, 'a.vcf', 'added'),
    );
    await dataSource.transaction((manager) =>
      service.recordChange(manager, addressbook.id, 'b.vcf', 'added'),
    );
    await dataSource.transaction((manager) =>
      service.recordChange(manager, addressbook.id, 'a.vcf', 'deleted'),
    );

    const reloaded = await dataSource
      .getRepository(AddressbookCollection)
      .findOneByOrFail({ id: addressbook.id });
    expect(reloaded.syncSeq).toBe(3);

    const changes = await dataSource
      .getRepository(AddressbookChange)
      .findBy({ addressbookId: addressbook.id });
    expect(changes.map((c) => c.seq).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('rolls back both the syncSeq bump and the change record if the surrounding transaction fails', async () => {
    await expect(
      dataSource.transaction(async (manager) => {
        await service.recordChange(manager, addressbook.id, 'a.vcf', 'added');
        throw new Error('simulated failure after recording the change');
      }),
    ).rejects.toThrow('simulated failure');

    const reloaded = await dataSource
      .getRepository(AddressbookCollection)
      .findOneByOrFail({ id: addressbook.id });
    expect(reloaded.syncSeq).toBe(0);
    expect(
      await dataSource
        .getRepository(AddressbookChange)
        .findBy({ addressbookId: addressbook.id }),
    ).toEqual([]);
  });
});
