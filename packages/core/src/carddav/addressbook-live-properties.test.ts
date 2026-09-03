import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  AddressbookCollection,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import type { PropertyProviderContext } from '../webdav/properties/property-provider.interface.js';
import { AddressbookHomeCollection } from './addressbook-home-tree-resource.js';
import { AddressbookLiveProperties } from './addressbook-live-properties.js';

describe('AddressbookLiveProperties', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let ownerPrincipal: Principal;
  let context: PropertyProviderContext;
  const provider = new AddressbookLiveProperties();

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await dataSource
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
    context = { tenant, principal: ownerPrincipal, manager: dataSource.manager };
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('reports the home collection as a plain DAV:collection, not an addressbook', async () => {
    const properties = await provider.listLiveProperties(
      new AddressbookHomeCollection(ownerPrincipal.id),
      context,
    );

    const resourcetype = properties.find((p) => p.name === 'resourcetype');
    expect(resourcetype?.value).toContain('<D:collection');
    expect(resourcetype?.value).not.toContain('addressbook');
  });

  it('reports an AddressbookCollection resourcetype as both DAV:collection and CARDDAV:addressbook', async () => {
    const addressbook = await dataSource
      .getRepository(AddressbookCollection)
      .save(
        dataSource.getRepository(AddressbookCollection).create({
          tenantId: tenant.id,
          ownerPrincipalId: ownerPrincipal.id,
          displayName: 'Contacts',
        }),
      );

    const properties = await provider.listLiveProperties(addressbook, context);

    const resourcetype = properties.find((p) => p.name === 'resourcetype');
    expect(resourcetype?.value).toContain('<D:collection');
    expect(resourcetype?.value).toContain('<C:addressbook');
    const displayname = properties.find((p) => p.name === 'displayname');
    expect(displayname?.value).toBe('Contacts');
  });

  it('omits addressbook-description when the addressbook has none', async () => {
    const addressbook = await dataSource
      .getRepository(AddressbookCollection)
      .save(
        dataSource.getRepository(AddressbookCollection).create({
          tenantId: tenant.id,
          ownerPrincipalId: ownerPrincipal.id,
          displayName: 'Contacts',
        }),
      );

    const properties = await provider.listLiveProperties(addressbook, context);

    expect(
      properties.find((p) => p.name === 'addressbook-description'),
    ).toBeUndefined();
  });

  it('includes addressbook-description when set', async () => {
    const addressbook = await dataSource
      .getRepository(AddressbookCollection)
      .save(
        dataSource.getRepository(AddressbookCollection).create({
          tenantId: tenant.id,
          ownerPrincipalId: ownerPrincipal.id,
          displayName: 'Contacts',
          description: 'Personal contacts',
        }),
      );

    const properties = await provider.listLiveProperties(addressbook, context);

    expect(
      properties.find((p) => p.name === 'addressbook-description')?.value,
    ).toBe('Personal contacts');
  });

  it('recognizes its own live property names via isLiveProperty', () => {
    expect(provider.isLiveProperty('DAV:', 'resourcetype')).toBe(true);
    expect(
      provider.isLiveProperty(
        'urn:ietf:params:xml:ns:carddav',
        'addressbook-description',
      ),
    ).toBe(true);
    expect(provider.isLiveProperty('DAV:', 'getetag')).toBe(false);
  });
});
