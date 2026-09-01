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
import {
  CycleDetectedError,
  DuplicateEntryError,
  NotFoundError,
} from './errors.js';
import { GroupService } from './group.service.js';
import { GroupMembershipService } from './group-membership.service.js';
import { UserService } from './user.service.js';

describe('GroupMembershipService', () => {
  let dataSource: DataSource;
  let groupService: GroupService;
  let userService: UserService;
  let membershipService: GroupMembershipService;
  let tenant: Tenant;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    groupService = new GroupService(dataSource);
    userService = new UserService(dataSource);
    membershipService = new GroupMembershipService(dataSource);

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

  async function group(name: string): Promise<Group> {
    return groupService.createGroup({ tenantId: tenant.id, name });
  }

  async function user(username: string): Promise<Principal> {
    const created = await userService.createUser({
      tenantId: tenant.id,
      username,
      email: `${username}@example.com`,
      password: 'correct horse battery staple',
    });
    return dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: created.principalId });
  }

  it('adds and removes a user member', async () => {
    const groupA = await group('a');
    const alice = await user('alice');

    await membershipService.addMember(groupA.id, alice.id);
    expect(
      await dataSource
        .getRepository(GroupMembership)
        .findOneBy({ groupId: groupA.id, memberPrincipalId: alice.id }),
    ).not.toBeNull();

    await membershipService.removeMember(groupA.id, alice.id);
    expect(
      await dataSource
        .getRepository(GroupMembership)
        .findOneBy({ groupId: groupA.id, memberPrincipalId: alice.id }),
    ).toBeNull();
  });

  it('is a no-op when removing a membership that does not exist', async () => {
    const groupA = await group('a');
    const alice = await user('alice');

    await expect(
      membershipService.removeMember(groupA.id, alice.id),
    ).resolves.toBeUndefined();
  });

  it('rejects a duplicate membership with a DuplicateEntryError', async () => {
    const groupA = await group('a');
    const alice = await user('alice');
    await membershipService.addMember(groupA.id, alice.id);

    await expect(
      membershipService.addMember(groupA.id, alice.id),
    ).rejects.toThrow(DuplicateEntryError);
  });

  it('throws NotFoundError for an unknown group or member principal', async () => {
    const groupA = await group('a');
    const alice = await user('alice');

    await expect(
      membershipService.addMember('no-such-group', alice.id),
    ).rejects.toThrow(NotFoundError);
    await expect(
      membershipService.addMember(groupA.id, 'no-such-principal'),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects a direct cycle (A contains B, B would contain A)', async () => {
    const groupA = await group('a');
    const groupB = await group('b');

    await membershipService.addMember(groupA.id, groupB.principalId);

    await expect(
      membershipService.addMember(groupB.id, groupA.principalId),
    ).rejects.toThrow(CycleDetectedError);
  });

  it('rejects an indirect cycle (A contains B contains C, C would contain A)', async () => {
    const groupA = await group('a');
    const groupB = await group('b');
    const groupC = await group('c');

    await membershipService.addMember(groupA.id, groupB.principalId);
    await membershipService.addMember(groupB.id, groupC.principalId);

    await expect(
      membershipService.addMember(groupC.id, groupA.principalId),
    ).rejects.toThrow(CycleDetectedError);
  });

  it('resolves nested, non-cyclic groups into a deduplicated member list', async () => {
    const groupA = await group('a');
    const groupB = await group('b');
    const alice = await user('alice');
    const bob = await user('bob');

    await membershipService.addMember(groupA.id, groupB.principalId);
    await membershipService.addMember(groupA.id, alice.id);
    await membershipService.addMember(groupB.id, bob.id);

    const members = await membershipService.resolveEffectiveMembers(groupA.id);
    const memberIds = members.map((m) => m.id).sort();
    expect(memberIds).toEqual([groupB.principalId, alice.id, bob.id].sort());
  });

  it('dedupes diamond memberships (same principal reachable via two paths)', async () => {
    const top = await group('top');
    const left = await group('left');
    const right = await group('right');
    const shared = await user('shared');

    await membershipService.addMember(top.id, left.principalId);
    await membershipService.addMember(top.id, right.principalId);
    await membershipService.addMember(left.id, shared.id);
    await membershipService.addMember(right.id, shared.id);

    const members = await membershipService.resolveEffectiveMembers(top.id);
    const sharedOccurrences = members.filter((m) => m.id === shared.id);
    expect(sharedOccurrences).toHaveLength(1);
  });

  it('terminates resolveEffectiveMembers even if a cycle exists in the data', async () => {
    // Bypasses addMember's own guard on purpose, to simulate a cycle
    // that got into the data some other way (e.g. a bug), and verify the
    // visited-set in the traversal still makes this terminate.
    const groupA = await group('a');
    const groupB = await group('b');
    const memberships = dataSource.getRepository(GroupMembership);
    await memberships.save(
      memberships.create({
        groupId: groupA.id,
        memberPrincipalId: groupB.principalId,
      }),
    );
    await memberships.save(
      memberships.create({
        groupId: groupB.id,
        memberPrincipalId: groupA.principalId,
      }),
    );

    await expect(
      membershipService.resolveEffectiveMembers(groupA.id),
    ).resolves.toBeDefined();
  });

  it('resolveGroupsForPrincipal finds direct membership', async () => {
    const groupA = await group('a');
    const alice = await user('alice');
    await membershipService.addMember(groupA.id, alice.id);

    const groups = await membershipService.resolveGroupsForPrincipal(
      alice.id,
    );
    expect(groups.map((g) => g.id)).toEqual([groupA.id]);
  });

  it('resolveGroupsForPrincipal finds transitive membership over two nested groups', async () => {
    const groupA = await group('a');
    const groupB = await group('b');
    const groupC = await group('c');
    const alice = await user('alice');

    // alice is a member of C, C is a member of B, B is a member of A —
    // alice should be resolved as a member of B and A too.
    await membershipService.addMember(groupC.id, alice.id);
    await membershipService.addMember(groupB.id, groupC.principalId);
    await membershipService.addMember(groupA.id, groupB.principalId);

    const groups = await membershipService.resolveGroupsForPrincipal(
      alice.id,
    );
    const groupIds = groups.map((g) => g.id).sort();
    expect(groupIds).toEqual([groupA.id, groupB.id, groupC.id].sort());
  });

  it('resolveGroupsForPrincipal terminates even if a cycle exists in the data', async () => {
    const groupA = await group('a');
    const groupB = await group('b');
    const memberships = dataSource.getRepository(GroupMembership);
    await memberships.save(
      memberships.create({
        groupId: groupA.id,
        memberPrincipalId: groupB.principalId,
      }),
    );
    await memberships.save(
      memberships.create({
        groupId: groupB.id,
        memberPrincipalId: groupA.principalId,
      }),
    );

    await expect(
      membershipService.resolveGroupsForPrincipal(groupA.principalId),
    ).resolves.toBeDefined();
  });

  it('resolveGroupsForPrincipal dedupes diamond memberships (same ancestor group reachable via two paths)', async () => {
    const top = await group('top');
    const left = await group('left');
    const right = await group('right');
    const shared = await user('shared');

    await membershipService.addMember(top.id, left.principalId);
    await membershipService.addMember(top.id, right.principalId);
    await membershipService.addMember(left.id, shared.id);
    await membershipService.addMember(right.id, shared.id);

    const groups = await membershipService.resolveGroupsForPrincipal(
      shared.id,
    );
    const topOccurrences = groups.filter((g) => g.id === top.id);
    expect(topOccurrences).toHaveLength(1);
  });
});
