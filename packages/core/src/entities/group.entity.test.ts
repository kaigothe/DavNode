import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/index.js';
import {
  ALL_ENTITIES,
  Group,
  GroupMembership,
  Principal,
  Tenant,
} from './index.js';

describe('Group and GroupMembership entities', () => {
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

  async function createTenant(): Promise<Tenant> {
    const repository = dataSource.getRepository(Tenant);
    return repository.save(
      repository.create({ slug: 'acme', name: 'Acme Inc.' }),
    );
  }

  async function createPrincipal(
    tenant: Tenant,
    kind: 'user' | 'group',
  ): Promise<Principal> {
    const repository = dataSource.getRepository(Principal);
    return repository.save(
      repository.create({ tenantId: tenant.id, kind, specialKind: null }),
    );
  }

  it('persists a group owning a principal', async () => {
    const tenant = await createTenant();
    const principal = await createPrincipal(tenant, 'group');
    const repository = dataSource.getRepository(Group);

    const saved = await repository.save(
      repository.create({
        principalId: principal.id,
        tenantId: tenant.id,
        name: 'editors',
        description: null,
      }),
    );

    const found = await repository.findOneByOrFail({ id: saved.id });
    expect(found.name).toBe('editors');
    expect(found.description).toBeNull();
  });

  it('rejects two groups with the same name in the same tenant', async () => {
    const tenant = await createTenant();
    const repository = dataSource.getRepository(Group);

    await repository.save(
      repository.create({
        principalId: (await createPrincipal(tenant, 'group')).id,
        tenantId: tenant.id,
        name: 'editors',
        description: null,
      }),
    );

    await expect(
      repository.save(
        repository.create({
          principalId: (await createPrincipal(tenant, 'group')).id,
          tenantId: tenant.id,
          name: 'editors',
          description: null,
        }),
      ),
    ).rejects.toThrow();
  });

  it('allows a group to have a user and a nested group as members', async () => {
    const tenant = await createTenant();
    const groups = dataSource.getRepository(Group);
    const memberships = dataSource.getRepository(GroupMembership);

    const parentGroup = await groups.save(
      groups.create({
        principalId: (await createPrincipal(tenant, 'group')).id,
        tenantId: tenant.id,
        name: 'parent',
        description: null,
      }),
    );
    const childGroup = await groups.save(
      groups.create({
        principalId: (await createPrincipal(tenant, 'group')).id,
        tenantId: tenant.id,
        name: 'child',
        description: null,
      }),
    );
    const userPrincipal = await createPrincipal(tenant, 'user');

    await memberships.save(
      memberships.create({
        groupId: parentGroup.id,
        memberPrincipalId: userPrincipal.id,
      }),
    );
    await memberships.save(
      memberships.create({
        groupId: parentGroup.id,
        memberPrincipalId: childGroup.principalId,
      }),
    );

    const found = await memberships.findBy({ groupId: parentGroup.id });
    expect(found).toHaveLength(2);
  });

  it('rejects adding the same member to a group twice', async () => {
    const tenant = await createTenant();
    const groups = dataSource.getRepository(Group);
    const memberships = dataSource.getRepository(GroupMembership);

    const group = await groups.save(
      groups.create({
        principalId: (await createPrincipal(tenant, 'group')).id,
        tenantId: tenant.id,
        name: 'editors',
        description: null,
      }),
    );
    const memberPrincipal = await createPrincipal(tenant, 'user');

    await memberships.save(
      memberships.create({
        groupId: group.id,
        memberPrincipalId: memberPrincipal.id,
      }),
    );

    await expect(
      memberships.save(
        memberships.create({
          groupId: group.id,
          memberPrincipalId: memberPrincipal.id,
        }),
      ),
    ).rejects.toThrow();
  });
});
