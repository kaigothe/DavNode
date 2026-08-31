import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  Credential,
  Principal,
  Tenant,
  User,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/index.js';
import { DuplicateEntryError } from '../services/errors.js';
import { parseBootstrapArgs, runBootstrap } from './bootstrap.js';

describe('parseBootstrapArgs', () => {
  it('parses all required --key=value flags', () => {
    expect(
      parseBootstrapArgs([
        '--tenant-slug=acme',
        '--tenant-name=Acme Inc',
        '--username=admin',
        '--email=admin@example.com',
        '--password=hunter2',
      ]),
    ).toEqual({
      tenantSlug: 'acme',
      tenantName: 'Acme Inc',
      username: 'admin',
      email: 'admin@example.com',
      password: 'hunter2',
    });
  });

  it('throws a clear error for a missing required argument', () => {
    expect(() =>
      parseBootstrapArgs(['--tenant-slug=acme', '--username=admin']),
    ).toThrow(/Missing required argument/);
  });

  it('throws a clear error for a malformed argument, without echoing any value', () => {
    expect(() => parseBootstrapArgs(['--tenant-slug'])).toThrow(
      /Invalid argument "--tenant-slug"/,
    );
  });
});

describe('runBootstrap', () => {
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

  it('creates the tenant, its special principals, the admin user, its principal, and its credential in one run', async () => {
    const { tenant, user } = await runBootstrap(dataSource, {
      tenantSlug: 'acme',
      tenantName: 'Acme Inc.',
      username: 'admin',
      email: 'admin@example.com',
      password: 'correct horse battery staple',
    });

    expect(
      await dataSource.getRepository(Tenant).findOneBy({ id: tenant.id }),
    ).not.toBeNull();

    const specialPrincipals = await dataSource
      .getRepository(Principal)
      .findBy({ tenantId: tenant.id, kind: 'special' });
    expect(specialPrincipals).toHaveLength(3);

    expect(user.role).toBe('server_admin');
    const userPrincipal = await dataSource
      .getRepository(Principal)
      .findOneBy({ id: user.principalId });
    expect(userPrincipal?.kind).toBe('user');

    const credential = await dataSource
      .getRepository(Credential)
      .findOneBy({ userId: user.id, type: 'basic' });
    expect(credential).not.toBeNull();
  });

  it('aborts with a DuplicateEntryError on a second run with the same tenant slug', async () => {
    const args = {
      tenantSlug: 'acme',
      tenantName: 'Acme Inc.',
      username: 'admin',
      email: 'admin@example.com',
      password: 'correct horse battery staple',
    };

    await runBootstrap(dataSource, args);

    await expect(runBootstrap(dataSource, args)).rejects.toThrow(
      DuplicateEntryError,
    );

    // Exactly the first run's rows exist — no partial duplicate state.
    expect(await dataSource.getRepository(Tenant).find()).toHaveLength(1);
    expect(await dataSource.getRepository(User).find()).toHaveLength(1);
  });
});
