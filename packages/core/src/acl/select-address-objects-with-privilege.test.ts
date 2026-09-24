import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  AddressbookAce,
  AddressbookCollection,
  AddressObject,
  AddressObjectAce,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import {
  hasAddressbookPrivilege,
  selectAddressObjectsWithPrivilege,
} from './evaluate-privilege.js';

describe('selectAddressObjectsWithPrivilege', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: Principal;
  let bob: Principal;
  let carol: Principal;
  let ownerSpecial: Principal;
  let addressbook: AddressbookCollection;
  const contacts: Record<string, AddressObject> = {};

  async function principal(): Promise<Principal> {
    return dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
  }

  async function addressbookAce(
    principalId: string,
    grantDeny: 'grant' | 'deny',
    position: number,
  ): Promise<void> {
    await dataSource.getRepository(AddressbookAce).save(
      dataSource.getRepository(AddressbookAce).create({
        addressbookId: addressbook.id,
        principalId,
        privilege: 'read',
        grantDeny,
        position,
      }),
    );
  }

  async function contact(
    name: string,
    owner: Principal,
    aces: Array<{ principal: Principal; grantDeny: 'grant' | 'deny' }> = [],
  ): Promise<void> {
    const saved = await dataSource.getRepository(AddressObject).save(
      dataSource.getRepository(AddressObject).create({
        tenantId: tenant.id,
        addressbookId: addressbook.id,
        name,
        uid: `uid-${name}`,
        etag: 'e',
        ownerPrincipalId: owner.id,
      }),
    );
    for (const [position, ace] of aces.entries()) {
      await dataSource.getRepository(AddressObjectAce).save(
        dataSource.getRepository(AddressObjectAce).create({
          addressObjectId: saved.id,
          principalId: ace.principal.id,
          privilege: 'read',
          grantDeny: ace.grantDeny,
          position,
        }),
      );
    }
    contacts[name] = saved;
  }

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
    alice = await principal();
    bob = await principal();
    carol = await principal();
    ownerSpecial = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ tenantId: tenant.id, specialKind: 'owner' });
    addressbook = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.id,
        displayName: 'Contacts',
      }),
    );

    // The addressbook grants read to alice directly, to bob directly, and to
    // "whoever owns the object" (DAV:owner); carol gets nothing.
    await addressbookAce(alice.id, 'grant', 0);
    await addressbookAce(bob.id, 'grant', 1);
    await addressbookAce(ownerSpecial.id, 'grant', 2);

    await contact('plain.vcf', alice); // inherits everything
    await contact('deny-bob.vcf', alice, [
      { principal: bob, grantDeny: 'deny' },
    ]);
    await contact('grant-carol.vcf', alice, [
      { principal: carol, grantDeny: 'grant' },
    ]);
    await contact('carols.vcf', carol); // DAV:owner applies to carol here
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('gives, for every principal and contact, exactly the answer hasAddressbookPrivilege gives', async () => {
    const all = Object.values(contacts);
    for (const who of [alice, bob, carol]) {
      const batched = await selectAddressObjectsWithPrivilege(
        dataSource.manager,
        who,
        addressbook,
        all,
        'read',
      );
      for (const contactRow of all) {
        expect(
          batched.has(contactRow.id),
          `${who.id === alice.id ? 'alice' : who.id === bob.id ? 'bob' : 'carol'} on ${contactRow.name}`,
        ).toBe(
          await hasAddressbookPrivilege(
            dataSource.manager,
            who,
            contactRow,
            'read',
          ),
        );
      }
    }
  });

  it('honours contact-level denies and grants and the per-object DAV:owner', async () => {
    const all = Object.values(contacts);
    const names = async (who: Principal) =>
      [
        ...(await selectAddressObjectsWithPrivilege(
          dataSource.manager,
          who,
          addressbook,
          all,
          'read',
        )),
      ]
        .map((id) => all.find((c) => c.id === id)?.name)
        .sort();

    expect(await names(alice)).toEqual([
      'carols.vcf',
      'deny-bob.vcf',
      'grant-carol.vcf',
      'plain.vcf',
    ]);
    // bob: denied on deny-bob.vcf by the object's own first-matching ACE.
    expect(await names(bob)).toEqual([
      'carols.vcf',
      'grant-carol.vcf',
      'plain.vcf',
    ]);
    // carol: only what names her — her own grant, and the object she owns.
    expect(await names(carol)).toEqual(['carols.vcf', 'grant-carol.vcf']);
  });

  it('returns an empty set without querying for no objects', async () => {
    const result = await selectAddressObjectsWithPrivilege(
      dataSource.manager,
      alice,
      addressbook,
      [],
      'read',
    );

    expect(result.size).toBe(0);
  });

  it('handles more objects than one ACE lookup chunk carries', async () => {
    const many: AddressObject[] = [];
    for (let index = 0; index < 1100; index += 1) {
      many.push(
        dataSource.getRepository(AddressObject).create({
          tenantId: tenant.id,
          addressbookId: addressbook.id,
          name: `bulk-${index}.vcf`,
          uid: `bulk-${index}`,
          etag: 'e',
          ownerPrincipalId: alice.id,
        }),
      );
    }
    const saved = await dataSource.getRepository(AddressObject).save(many, {
      chunk: 200,
    });
    await dataSource.getRepository(AddressObjectAce).save(
      dataSource.getRepository(AddressObjectAce).create({
        addressObjectId: saved[1050].id,
        principalId: bob.id,
        privilege: 'read',
        grantDeny: 'deny',
        position: 0,
      }),
    );

    const allowed = await selectAddressObjectsWithPrivilege(
      dataSource.manager,
      bob,
      addressbook,
      saved,
      'read',
    );

    expect(allowed.size).toBe(1099);
    expect(allowed.has(saved[1050].id)).toBe(false);
    expect(allowed.has(saved[0].id)).toBe(true);
  });
});
