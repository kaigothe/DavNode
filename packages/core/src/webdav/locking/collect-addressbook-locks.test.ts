import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../../db/data-source.js';
import {
  AddressbookCollection,
  AddressbookLock,
  AddressObject,
  AddressObjectLock,
  ALL_ENTITIES,
  Principal,
  Tenant,
} from '../../entities/index.js';
import { ALL_MIGRATIONS } from '../../migrations/sqlite/index.js';
import { getEffectiveAddressbookLocks } from './collect-locks.js';

describe('getEffectiveAddressbookLocks', () => {
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

  async function contact(name: string): Promise<AddressObject> {
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

  let nextTokenSuffix = 1;
  function nextToken(): string {
    const suffix = String(nextTokenSuffix++).padStart(12, '0');
    return `urn:uuid:00000000-0000-0000-0000-${suffix}`;
  }

  async function addressbookLock(
    overrides: Partial<{
      scope: 'exclusive' | 'shared';
      depth: 'zero' | 'infinity';
      expiresAt: Date | null;
      token: string;
    }> = {},
  ): Promise<AddressbookLock> {
    return dataSource.getRepository(AddressbookLock).save(
      dataSource.getRepository(AddressbookLock).create({
        addressbookId: addressbook.id,
        principalId: principal.id,
        token: overrides.token ?? nextToken(),
        scope: overrides.scope ?? 'exclusive',
        depth: overrides.depth ?? 'infinity',
        timeoutSeconds: null,
        expiresAt: overrides.expiresAt ?? null,
        ownerInfo: null,
      }),
    );
  }

  async function addressObjectLock(
    addressObjectId: string,
    overrides: Partial<{
      scope: 'exclusive' | 'shared';
      expiresAt: Date | null;
      token: string;
    }> = {},
  ): Promise<AddressObjectLock> {
    return dataSource.getRepository(AddressObjectLock).save(
      dataSource.getRepository(AddressObjectLock).create({
        addressObjectId,
        principalId: principal.id,
        token: overrides.token ?? nextToken(),
        scope: overrides.scope ?? 'exclusive',
        timeoutSeconds: null,
        expiresAt: overrides.expiresAt ?? null,
        ownerInfo: null,
      }),
    );
  }

  it('a depth:infinity lock on the addressbook applies to a contact inside it', async () => {
    const lock = await addressbookLock({ depth: 'infinity' });
    const doc = await contact('forrest.vcf');

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveAddressbookLocks(manager, doc),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: lock.id,
        inherited: true,
        inheritedFrom: addressbook.id,
      }),
    ]);
  });

  it('a depth:zero lock on the addressbook does not apply to its contacts', async () => {
    await addressbookLock({ depth: 'zero' });
    const doc = await contact('forrest.vcf');

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveAddressbookLocks(manager, doc),
    );

    expect(result).toEqual([]);
  });

  it('a depth:zero lock still applies directly to the addressbook it is on', async () => {
    const lock = await addressbookLock({ depth: 'zero' });

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveAddressbookLocks(manager, addressbook),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: lock.id,
        inherited: false,
        inheritedFrom: null,
      }),
    ]);
  });

  it('an expired lock is not returned', async () => {
    const doc = await contact('forrest.vcf');
    await addressObjectLock(doc.id, { expiresAt: new Date(Date.now() - 1000) });

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveAddressbookLocks(manager, doc),
    );

    expect(result).toEqual([]);
  });

  it('combines a contact’s own direct lock with an inherited addressbook lock', async () => {
    const doc = await contact('forrest.vcf');
    const ownLock = await addressObjectLock(doc.id);
    const ancestorLock = await addressbookLock({ depth: 'infinity' });

    const result = await dataSource.manager.transaction((manager) =>
      getEffectiveAddressbookLocks(manager, doc),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: ownLock.id,
        inherited: false,
        inheritedFrom: null,
      }),
      expect.objectContaining({
        id: ancestorLock.id,
        inherited: true,
        inheritedFrom: addressbook.id,
      }),
    ]);
  });
});
