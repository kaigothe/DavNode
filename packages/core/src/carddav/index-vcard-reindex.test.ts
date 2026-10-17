import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  AddressObject,
  AddressObjectContent,
  AddressObjectIndex,
  AddressbookCollection,
  Principal,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import {
  INDEX_VERSION,
  INDEX_VERSION_PROPERTY,
  reindexStaleAddressObjects,
} from './index-vcard.js';

const VCARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'UID:u',
  'FN:Ann',
  'NOTE:Met at the Fair',
  'END:VCARD',
  '',
].join('\r\n');

describe('reindexStaleAddressObjects', () => {
  let dataSource: DataSource;
  let addressObjectId: string;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    const tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme',
    });
    const owner = await dataSource
      .getRepository(Principal)
      .save({ tenantId: tenant.id, kind: 'user', specialKind: null });
    const book = await dataSource.getRepository(AddressbookCollection).save({
      tenantId: tenant.id,
      ownerPrincipalId: owner.id,
      displayName: 'Contacts',
    });
    const contact = await dataSource.getRepository(AddressObject).save({
      tenantId: tenant.id,
      addressbookId: book.id,
      name: 'a.vcf',
      uid: 'u',
      etag: 'e',
      ownerPrincipalId: owner.id,
    } as AddressObject);
    addressObjectId = contact.id;
    await dataSource
      .getRepository(AddressObjectContent)
      .save({ addressObjectId, vcardData: VCARD } as AddressObjectContent);
    // The state before the index learned NOTE: an FN row, no marker.
    await dataSource
      .getRepository(AddressObjectIndex)
      .save({ addressObjectId, propertyName: 'FN', propertyValue: 'ann' });
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('indexes stale objects once and leaves current ones alone', async () => {
    expect(await reindexStaleAddressObjects(dataSource)).toBe(1);
    const rows = await dataSource
      .getRepository(AddressObjectIndex)
      .findBy({ addressObjectId });
    expect(rows.find((row) => row.propertyName === 'NOTE')?.propertyValue).toBe(
      'met at the fair',
    );
    expect(
      rows.find((row) => row.propertyName === INDEX_VERSION_PROPERTY)
        ?.propertyValue,
    ).toBe(INDEX_VERSION);
    expect(await reindexStaleAddressObjects(dataSource)).toBe(0);
  });
});
