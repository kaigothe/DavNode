import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  AddressObject,
  AddressObjectIndex,
  AddressbookCollection,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import {
  INDEXED_PROPERTY_NAMES,
  indexVCard,
  normalizeIndexValue,
} from './index-vcard.js';
import { parseVCard } from './vcard-parser.js';

describe('normalizeIndexValue', () => {
  it('trims and lowercases, keeping accents and inner whitespace', () => {
    expect(normalizeIndexValue('  Alice@Example.COM \t')).toBe(
      'alice@example.com',
    );
    expect(normalizeIndexValue('José  García')).toBe('josé  garcía');
  });
});

describe('INDEXED_PROPERTY_NAMES', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('lists exactly the six properties the index holds', () => {
    expect([...INDEXED_PROPERTY_NAMES].sort()).toEqual([
      'EMAIL',
      'FN',
      'N',
      'NICKNAME',
      'ORG',
      'TEL',
    ]);
  });

  it('covers every property name indexVCard actually writes, with normalized values', async () => {
    const tenant: Tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme',
    });
    const owner = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    const book = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.id,
        displayName: 'Contacts',
      }),
    );
    const contact = await dataSource.getRepository(AddressObject).save(
      dataSource.getRepository(AddressObject).create({
        tenantId: tenant.id,
        addressbookId: book.id,
        name: 'a.vcf',
        uid: 'u',
        etag: 'e',
        ownerPrincipalId: owner.id,
      }),
    );

    await indexVCard(
      dataSource.manager,
      contact.id,
      parseVCard(
        [
          'BEGIN:VCARD',
          'VERSION:3.0',
          'UID:u',
          'FN: Ann Example ',
          'N:Example;Ann;;;',
          'EMAIL:Ann@Example.COM',
          'TEL:+1 555',
          'ORG:Acme',
          'NICKNAME:Annie',
          'END:VCARD',
          '',
        ].join('\r\n'),
      ),
    );

    const rows = await dataSource
      .getRepository(AddressObjectIndex)
      .findBy({ addressObjectId: contact.id });
    expect(rows.map((row) => row.propertyName).sort()).toEqual(
      [...INDEXED_PROPERTY_NAMES].sort(),
    );
    expect(
      rows.find((row) => row.propertyName === 'EMAIL')?.propertyValue,
    ).toBe('ann@example.com');
    expect(rows.find((row) => row.propertyName === 'FN')?.propertyValue).toBe(
      'ann example',
    );
  });
});
