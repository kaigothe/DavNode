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
import { CalendarHomeSetProperty } from './calendar-home-set-property.js';

describe('CalendarHomeSetProperty', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  const provider = new CalendarHomeSetProperty();

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

  function contextFor(principal: Principal): PropertyProviderContext {
    return { tenant, principal, manager: dataSource.manager };
  }

  it('reports the calendar home collection URL for a User principal', async () => {
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
        username: 'alice',
        email: 'alice@example.com',
        role: 'member',
      }),
    );

    const properties = await provider.listLiveProperties(
      user,
      contextFor(principal),
    );

    expect(properties).toEqual([
      {
        namespace: 'urn:ietf:params:xml:ns:caldav',
        name: 'calendar-home-set',
        value: `<D:href xmlns:D="DAV:">/dav/acme/calendars/${user.principalId}</D:href>`,
      },
    ]);
  });

  it('returns nothing for a Group principal', async () => {
    const principal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'group', specialKind: null }),
      );
    const group = await dataSource.getRepository(Group).save(
      dataSource.getRepository(Group).create({
        principalId: principal.id,
        tenantId: tenant.id,
        name: 'engineering',
      }),
    );

    expect(
      await provider.listLiveProperties(group, contextFor(principal)),
    ).toEqual([]);
  });

  it('recognizes only the calendar-home-set property in the CalDAV namespace via isLiveProperty', () => {
    expect(
      provider.isLiveProperty(
        'urn:ietf:params:xml:ns:caldav',
        'calendar-home-set',
      ),
    ).toBe(true);
    expect(provider.isLiveProperty('DAV:', 'calendar-home-set')).toBe(false);
    expect(
      provider.isLiveProperty(
        'urn:ietf:params:xml:ns:carddav',
        'calendar-home-set',
      ),
    ).toBe(false);
  });
});
