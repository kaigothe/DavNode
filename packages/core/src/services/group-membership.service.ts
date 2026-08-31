import type { DataSource } from 'typeorm';
import { In } from 'typeorm';
import { Group } from '../entities/group.entity.js';
import { GroupMembership } from '../entities/group-membership.entity.js';
import { Principal } from '../entities/principal.entity.js';
import {
  CycleDetectedError,
  DuplicateEntryError,
  NotFoundError,
} from './errors.js';
import { isUniqueConstraintViolationError } from './unique-constraint.util.js';

/**
 * Group membership management: adding/removing members and resolving a
 * group's full, transitively-expanded membership. Split out from
 * `GroupService` because nested groups (a group as a member of another
 * group) open up the possibility of **cycles** (group A contains B, B
 * contains A) — undetected, that would send the ACL engine's later
 * "is principal X a member of group Y" resolution (RFC 3744, M3) into an
 * infinite loop. Preventing that is this service's main job.
 */
export class GroupMembershipService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Adds `memberPrincipalId` as a member of `groupId`.
   *
   * If `memberPrincipalId` is itself a group's principal, this first
   * checks — via a graph traversal over the existing membership data,
   * *before* writing anything — whether `groupId` is already a
   * (transitive) member of that group. If it is, adding the membership
   * would close a cycle, so this throws instead of inserting the row.
   *
   * @throws {@link NotFoundError} If `groupId` or `memberPrincipalId`
   * doesn't exist.
   * @throws {@link CycleDetectedError} If adding this membership would
   * create a cycle.
   * @throws {@link DuplicateEntryError} If `memberPrincipalId` is already
   * a member of `groupId`.
   */
  async addMember(groupId: string, memberPrincipalId: string): Promise<void> {
    const memberPrincipal = await this.dataSource
      .getRepository(Principal)
      .findOneBy({ id: memberPrincipalId });
    if (!memberPrincipal) {
      throw new NotFoundError(`Principal "${memberPrincipalId}" not found.`);
    }
    const targetGroup = await this.dataSource
      .getRepository(Group)
      .findOneBy({ id: groupId });
    if (!targetGroup) {
      throw new NotFoundError(`Group "${groupId}" not found.`);
    }

    if (memberPrincipal.kind === 'group') {
      const memberGroup = await this.dataSource
        .getRepository(Group)
        .findOneBy({ principalId: memberPrincipalId });
      if (memberGroup) {
        const reachable = await this.collectTransitiveMemberPrincipalIds(
          memberGroup.id,
        );
        if (reachable.has(targetGroup.principalId)) {
          throw new CycleDetectedError(
            `Cannot add this member: group "${groupId}" is already a (transitive) member of the group being added, so this would create a cycle.`,
          );
        }
      }
    }

    try {
      const repository = this.dataSource.getRepository(GroupMembership);
      await repository.save(repository.create({ groupId, memberPrincipalId }));
    } catch (error) {
      if (isUniqueConstraintViolationError(error)) {
        throw new DuplicateEntryError(
          'memberPrincipalId',
          'This principal is already a member of this group.',
        );
      }
      throw error;
    }
  }

  /**
   * Removes `memberPrincipalId` from `groupId`'s membership, if present.
   * A no-op (not an error) if that membership doesn't exist.
   */
  async removeMember(
    groupId: string,
    memberPrincipalId: string,
  ): Promise<void> {
    await this.dataSource
      .getRepository(GroupMembership)
      .delete({ groupId, memberPrincipalId });
  }

  /**
   * Resolves every principal that is, directly or transitively, a member
   * of `groupId` — nested groups are expanded recursively, and both the
   * nested group's own principal and its members are included. Dedupes
   * across diamond memberships (the same principal reachable through more
   * than one path), and terminates even if the underlying data contains a
   * cycle (e.g. from a bug elsewhere, bypassing {@link addMember}'s own
   * guard), via the visited-group-ids set in the internal traversal
   * helper.
   *
   * @returns The resolved member principals, in no particular order.
   */
  async resolveEffectiveMembers(groupId: string): Promise<Principal[]> {
    const memberPrincipalIds =
      await this.collectTransitiveMemberPrincipalIds(groupId);
    if (memberPrincipalIds.size === 0) {
      return [];
    }
    return this.dataSource
      .getRepository(Principal)
      .findBy({ id: In([...memberPrincipalIds]) });
  }

  /**
   * Breadth-first traversal of the group-membership graph starting at
   * `startGroupId`, collecting every reachable member principal id
   * (including nested groups' own principal ids). `visitedGroupIds`
   * guards against revisiting the same group twice — both for
   * efficiency, and so a cycle in the data can't cause an infinite loop.
   */
  private async collectTransitiveMemberPrincipalIds(
    startGroupId: string,
  ): Promise<Set<string>> {
    const memberPrincipalIds = new Set<string>();
    const visitedGroupIds = new Set<string>();
    const queue: string[] = [startGroupId];

    const membershipRepository = this.dataSource.getRepository(GroupMembership);
    const groupRepository = this.dataSource.getRepository(Group);

    while (queue.length > 0) {
      const currentGroupId = queue.shift();
      if (currentGroupId === undefined || visitedGroupIds.has(currentGroupId)) {
        continue;
      }
      visitedGroupIds.add(currentGroupId);

      const memberships = await membershipRepository.findBy({
        groupId: currentGroupId,
      });

      for (const membership of memberships) {
        memberPrincipalIds.add(membership.memberPrincipalId);

        const nestedGroup = await groupRepository.findOneBy({
          principalId: membership.memberPrincipalId,
        });
        if (nestedGroup && !visitedGroupIds.has(nestedGroup.id)) {
          queue.push(nestedGroup.id);
        }
      }
    }

    return memberPrincipalIds;
  }
}
