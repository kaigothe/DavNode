import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  Group,
  Principal,
  Tenant,
  User,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import type { PropertyProviderContext } from '../webdav/properties/property-provider.interface.js';
import { AddressbookHomeSetProperty } from './addressbook-home-set-property.js';

describe('AddressbookHomeSetProperty', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let context: PropertyProviderContext;
  const provider = new AddressbookHomeSetProperty();

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
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function createUser(username: string): Promise<User> {
    const principal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        principalId: principal.id,
        tenantId: tenant.id,
        username,
        email: `${username}@example.com`,
        role: 'member',
      }),
    );
    context = { tenant, principal, manager: dataSource.manager };
    return user;
  }

  it('reports the home collection URL for a User principal', async () => {
    const user = await createUser('alice');

    const properties = await provider.listLiveProperties(user, context);

    expect(properties).toHaveLength(1);
    expect(properties[0]?.namespace).toBe(
      'urn:ietf:params:xml:ns:carddav',
    );
    expect(properties[0]?.name).toBe('addressbook-home-set');
    expect(properties[0]?.value).toBe(
      `<D:href xmlns:D="DAV:">/dav/acme/addressbooks/${user.principalId}</D:href>`,
    );
  });

  it('returns nothing for a Group principal', async () => {
    const groupPrincipal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'group', specialKind: null }),
      );
    const group = await dataSource.getRepository(Group).save(
      dataSource.getRepository(Group).create({
        principalId: groupPrincipal.id,
        tenantId: tenant.id,
        name: 'engineering',
      }),
    );
    context = { tenant, principal: groupPrincipal, manager: dataSource.manager };

    const properties = await provider.listLiveProperties(group, context);

    expect(properties).toEqual([]);
  });

  it('recognizes only the addressbook-home-set property via isLiveProperty', () => {
    expect(
      provider.isLiveProperty(
        'urn:ietf:params:xml:ns:carddav',
        'addressbook-home-set',
      ),
    ).toBe(true);
    expect(provider.isLiveProperty('DAV:', 'addressbook-home-set')).toBe(
      false,
    );
  });
});
