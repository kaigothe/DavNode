import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  Group,
  GroupMembership,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { DuplicateEntryError, NotFoundError } from './errors.js';
import { GroupService } from './group.service.js';

describe('GroupService', () => {
  let dataSource: DataSource;
  let service: GroupService;
  let tenant: Tenant;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new GroupService(dataSource);

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

  it('creates a principal and group consistently', async () => {
    const group = await service.createGroup({
      tenantId: tenant.id,
      name: 'editors',
    });

    const principal = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: group.principalId });
    expect(principal.kind).toBe('group');
  });

  it('rejects a duplicate group name within the same tenant with a DuplicateEntryError', async () => {
    await service.createGroup({ tenantId: tenant.id, name: 'editors' });

    await expect(
      service.createGroup({ tenantId: tenant.id, name: 'editors' }),
    ).rejects.toThrow(DuplicateEntryError);
  });

  it('finds a group by name within its tenant', async () => {
    const created = await service.createGroup({
      tenantId: tenant.id,
      name: 'editors',
    });

    await expect(
      service.findGroupByName(tenant.id, 'editors'),
    ).resolves.toMatchObject({ id: created.id });
  });

  it('returns null from findGroupByName for an unknown name', async () => {
    await expect(
      service.findGroupByName(tenant.id, 'no-such-group'),
    ).resolves.toBeNull();
  });

  it('throws NotFoundError when deleting an unknown group', async () => {
    await expect(service.deleteGroup('no-such-id')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('deletes a group and leaves no orphaned membership rows (as group or as member)', async () => {
    const parent = await service.createGroup({
      tenantId: tenant.id,
      name: 'parent',
    });
    const child = await service.createGroup({
      tenantId: tenant.id,
      name: 'child',
    });
    const memberships = dataSource.getRepository(GroupMembership);

    // `child` is both a group with its own member, and itself a member
    // of `parent` — deleting `child` must clean up both directions.
    const grandchild = await service.createGroup({
      tenantId: tenant.id,
      name: 'grandchild',
    });
    await memberships.save(
      memberships.create({
        groupId: child.id,
        memberPrincipalId: grandchild.principalId,
      }),
    );
    await memberships.save(
      memberships.create({
        groupId: parent.id,
        memberPrincipalId: child.principalId,
      }),
    );

    await service.deleteGroup(child.id);

    expect(
      await dataSource.getRepository(Group).findOneBy({ id: child.id }),
    ).toBeNull();
    const remaining = await memberships.find();
    expect(remaining).toHaveLength(0);
  });
});
