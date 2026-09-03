import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  AddressbookCollection,
  AddressObject,
  AddressObjectIndex,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { indexVCard } from './index-vcard.js';
import type { ParsedVCard } from './vcard-parser.js';

function parsedVCard(overrides: Partial<ParsedVCard> = {}): ParsedVCard {
  return {
    version: '4.0',
    uid: 'uid-1',
    fn: ['Forrest Gump'],
    n: ['Gump;Forrest;;;'],
    email: [],
    tel: [],
    org: [],
    nickname: [],
    ...overrides,
  };
}

describe('indexVCard', () => {
  let dataSource: DataSource;
  let addressObjectId: string;

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
    const addressObject = await dataSource.getRepository(AddressObject).save(
      dataSource.getRepository(AddressObject).create({
        tenantId: tenant.id,
        addressbookId: addressbook.id,
        name: 'contact.vcf',
        uid: 'uid-1',
        etag: 'etag-1',
        ownerPrincipalId: ownerPrincipal.id,
      }),
    );
    addressObjectId = addressObject.id;
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('creates one index row per property occurrence, including multi-valued EMAIL', async () => {
    await indexVCard(
      dataSource.manager,
      addressObjectId,
      parsedVCard({
        email: ['forrest@example.com', 'forrest@home.example.com'],
      }),
    );

    const repository = dataSource.getRepository(AddressObjectIndex);
    const emailRows = await repository.findBy({
      addressObjectId,
      propertyName: 'EMAIL',
    });
    expect(emailRows).toHaveLength(2);
    expect(emailRows.map((row) => row.propertyValue).sort()).toEqual([
      'forrest@home.example.com',
      'forrest@example.com',
    ].sort());

    const fnRows = await repository.findBy({
      addressObjectId,
      propertyName: 'FN',
    });
    expect(fnRows).toHaveLength(1);
  });

  it('does not create rows for properties absent from the vCard', async () => {
    await indexVCard(dataSource.manager, addressObjectId, parsedVCard());

    const repository = dataSource.getRepository(AddressObjectIndex);
    const nicknameRows = await repository.findBy({
      addressObjectId,
      propertyName: 'NICKNAME',
    });
    expect(nicknameRows).toHaveLength(0);
  });

  it('replaces all index rows on a repeat call, leaving no stale entries', async () => {
    await indexVCard(
      dataSource.manager,
      addressObjectId,
      parsedVCard({ email: ['old@example.com'], nickname: ['Old'] }),
    );

    await indexVCard(
      dataSource.manager,
      addressObjectId,
      parsedVCard({ email: ['new@example.com'] }),
    );

    const repository = dataSource.getRepository(AddressObjectIndex);
    const emailRows = await repository.findBy({
      addressObjectId,
      propertyName: 'EMAIL',
    });
    expect(emailRows).toHaveLength(1);
    expect(emailRows[0]?.propertyValue).toBe('new@example.com');

    const nicknameRows = await repository.findBy({
      addressObjectId,
      propertyName: 'NICKNAME',
    });
    expect(nicknameRows).toHaveLength(0);
  });

  it('normalizes the stored propertyValue (trimmed, lowercased) regardless of the raw casing', async () => {
    await indexVCard(
      dataSource.manager,
      addressObjectId,
      parsedVCard({ org: ['  Bubba GUMP Shrimp Co.  '] }),
    );

    const repository = dataSource.getRepository(AddressObjectIndex);
    const orgRows = await repository.findBy({
      addressObjectId,
      propertyName: 'ORG',
    });
    expect(orgRows).toHaveLength(1);
    expect(orgRows[0]?.propertyValue).toBe('bubba gump shrimp co.');
  });
});
