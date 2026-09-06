import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  AddressbookAce,
  AddressbookCollection,
  AddressObject,
  ALL_ENTITIES,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import type { Privilege } from './privilege.js';
import { hasAddressbookPrivilege } from './evaluate-privilege.js';

describe('hasAddressbookPrivilege', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: Principal;
  let bob: Principal;
  let addressbook: AddressbookCollection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    alice = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    bob = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    addressbook = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.id,
        displayName: 'Contacts',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function ace(
    principalId: string,
    privilege: Privilege,
    grantDeny: 'grant' | 'deny',
    position: number,
  ): Promise<AddressbookAce> {
    return dataSource.getRepository(AddressbookAce).save(
      dataSource.getRepository(AddressbookAce).create({
        addressbookId: addressbook.id,
        principalId,
        privilege,
        grantDeny,
        position,
      }),
    );
  }

  it('a grant ACE for the principal directly allows access', async () => {
    await ace(alice.id, 'read', 'grant', 0);

    const allowed = await dataSource.manager.transaction((manager) =>
      hasAddressbookPrivilege(manager, alice, addressbook, 'read'),
    );
    expect(allowed).toBe(true);
  });

  it('no matching ACE at all is default-deny', async () => {
    const allowed = await dataSource.manager.transaction((manager) =>
      hasAddressbookPrivilege(manager, bob, addressbook, 'read'),
    );
    expect(allowed).toBe(false);
  });

  it('granting bob an explicit ACE lets him access alice-owned addressbook (real ACL, not owner-only)', async () => {
    await ace(bob.id, 'read', 'grant', 0);

    const allowed = await dataSource.manager.transaction((manager) =>
      hasAddressbookPrivilege(manager, bob, addressbook, 'read'),
    );
    expect(allowed).toBe(true);
  });

  it('a deny ACE that comes before a matching grant ACE wins', async () => {
    await ace(alice.id, 'read', 'deny', 0);
    await ace(alice.id, 'all', 'grant', 1);

    const allowed = await dataSource.manager.transaction((manager) =>
      hasAddressbookPrivilege(manager, alice, addressbook, 'read'),
    );
    expect(allowed).toBe(false);
  });

  it('DAV:owner ACEs apply only to the actual owner, not other users', async () => {
    const ownerSpecial = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({
        tenantId: tenant.id,
        kind: 'special',
        specialKind: 'owner',
      });
    await ace(ownerSpecial.id, 'read', 'grant', 0);

    const allowedForOwner = await dataSource.manager.transaction((manager) =>
      hasAddressbookPrivilege(manager, alice, addressbook, 'read'),
    );
    expect(allowedForOwner).toBe(true);

    const allowedForOther = await dataSource.manager.transaction((manager) =>
      hasAddressbookPrivilege(manager, bob, addressbook, 'read'),
    );
    expect(allowedForOther).toBe(false);
  });

  it('evaluates against an AddressObject, inheriting the parent addressbook ACEs', async () => {
    await ace(alice.id, 'read', 'grant', 0);
    const contact = await dataSource.getRepository(AddressObject).save(
      dataSource.getRepository(AddressObject).create({
        tenantId: tenant.id,
        addressbookId: addressbook.id,
        name: 'forrest.vcf',
        uid: 'uid-1',
        etag: 'etag-1',
        ownerPrincipalId: alice.id,
      }),
    );

    const allowed = await dataSource.manager.transaction((manager) =>
      hasAddressbookPrivilege(manager, alice, contact, 'read'),
    );
    expect(allowed).toBe(true);
  });
});
