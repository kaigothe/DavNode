import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  Collection,
  CollectionAce,
  FileResource,
  GroupMembership,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { GroupService } from '../services/group.service.js';
import { TenantService } from '../services/tenant.service.js';
import { ALL_PRIVILEGES } from './privilege.js';
import { getCurrentUserPrivilegeSet, hasPrivilege } from './evaluate-privilege.js';

describe('hasPrivilege / getCurrentUserPrivilegeSet', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: Principal;
  let bob: Principal;
  let root: Collection;

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
    alice = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    bob = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    root = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: alice.id,
        displayName: 'root',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function ace(
    principalId: string,
    privilege: (typeof ALL_PRIVILEGES)[number],
    grantDeny: 'grant' | 'deny',
    position: number,
    options: { protected?: boolean } = {},
  ): Promise<CollectionAce> {
    return dataSource.getRepository(CollectionAce).save(
      dataSource.getRepository(CollectionAce).create({
        collectionId: root.id,
        principalId,
        privilege,
        grantDeny,
        position,
        protected: options.protected ?? false,
      }),
    );
  }

  it('a grant ACE for the principal directly allows access', async () => {
    await ace(alice.id, 'read', 'grant', 0);

    const allowed = await dataSource.manager.transaction((manager) =>
      hasPrivilege(manager, alice, root, 'read'),
    );
    expect(allowed).toBe(true);
  });

  it('a deny ACE that comes before a matching grant ACE wins', async () => {
    await ace(alice.id, 'read', 'deny', 0);
    await ace(alice.id, 'all', 'grant', 1);

    const allowed = await dataSource.manager.transaction((manager) =>
      hasPrivilege(manager, alice, root, 'read'),
    );
    expect(allowed).toBe(false);
  });

  it('a grant ACE for a group allows access for a transitive member', async () => {
    const groupService = new GroupService(dataSource);
    const top = await groupService.createGroup({
      tenantId: tenant.id,
      name: 'top',
    });
    const nested = await groupService.createGroup({
      tenantId: tenant.id,
      name: 'nested',
    });

    const membershipRepo = dataSource.getRepository(GroupMembership);
    // bob is a member of "nested", which is itself a member of "top" —
    // bob is a transitive member of "top".
    await membershipRepo.save(
      membershipRepo.create({
        groupId: top.id,
        memberPrincipalId: nested.principalId,
      }),
    );
    await membershipRepo.save(
      membershipRepo.create({
        groupId: nested.id,
        memberPrincipalId: bob.id,
      }),
    );

    await ace(top.principalId, 'read', 'grant', 0);

    const allowed = await dataSource.manager.transaction((manager) =>
      hasPrivilege(manager, bob, root, 'read'),
    );
    expect(allowed).toBe(true);
  });

  it('DAV:owner ACEs apply only to the actual owner, not other users', async () => {
    const ownerSpecial = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ tenantId: tenant.id, kind: 'special', specialKind: 'owner' });
    await ace(ownerSpecial.id, 'read', 'grant', 0);

    const allowedForOwner = await dataSource.manager.transaction((manager) =>
      hasPrivilege(manager, alice, root, 'read'),
    );
    expect(allowedForOwner).toBe(true);

    const allowedForOther = await dataSource.manager.transaction((manager) =>
      hasPrivilege(manager, bob, root, 'read'),
    );
    expect(allowedForOther).toBe(false);
  });

  it('no matching ACE at all is default-deny', async () => {
    await ace(bob.id, 'all', 'grant', 0);

    const allowed = await dataSource.manager.transaction((manager) =>
      hasPrivilege(manager, alice, root, 'read'),
    );
    expect(allowed).toBe(false);
  });

  it('getCurrentUserPrivilegeSet returns all eleven privileges for a DAV:all grant ACE', async () => {
    await ace(alice.id, 'all', 'grant', 0, { protected: true });

    const privileges = await dataSource.manager.transaction((manager) =>
      getCurrentUserPrivilegeSet(manager, alice, root),
    );
    expect(privileges.sort()).toEqual([...ALL_PRIVILEGES].sort());
  });

  it('getCurrentUserPrivilegeSet returns an empty list when no ACE matches', async () => {
    const privileges = await dataSource.manager.transaction((manager) =>
      getCurrentUserPrivilegeSet(manager, bob, root),
    );
    expect(privileges).toEqual([]);
  });

  it('evaluates against a FileResource, inheriting the parent collection ACEs', async () => {
    await ace(alice.id, 'read', 'grant', 0);
    const file = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: root.id,
        name: 'doc.txt',
        contentType: 'text/plain',
        etag: 'etag-1',
        sizeBytes: 1,
        ownerPrincipalId: alice.id,
      }),
    );

    const allowed = await dataSource.manager.transaction((manager) =>
      hasPrivilege(manager, alice, file, 'read'),
    );
    expect(allowed).toBe(true);
  });
});
