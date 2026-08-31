import type { DataSource } from 'typeorm';
import { Group } from '../entities/group.entity.js';
import { GroupMembership } from '../entities/group-membership.entity.js';
import { Principal } from '../entities/principal.entity.js';
import { DuplicateEntryError, NotFoundError } from './errors.js';
import { isUniqueConstraintViolationError } from './unique-constraint.util.js';

/** Input for {@link GroupService.createGroup}. */
export interface CreateGroupInput {
  tenantId: string;
  name: string;
  description?: string | null;
}

/**
 * Group management, backed directly by TypeORM repositories. Membership
 * management (adding/removing/resolving members) is deliberately kept
 * out of this service — see `GroupMembershipService` instead.
 */
export class GroupService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Creates a group in a single transaction: a `Principal`
   * (`kind: 'group'`) and the `Group` row referencing it.
   *
   * @throws {@link DuplicateEntryError} If `name` is already in use
   * within `input.tenantId`.
   */
  async createGroup(input: CreateGroupInput): Promise<Group> {
    return this.dataSource.transaction(async (manager) => {
      const principal = await manager.save(
        Principal,
        manager.create(Principal, {
          tenantId: input.tenantId,
          kind: 'group',
          specialKind: null,
        }),
      );

      try {
        return await manager.save(
          Group,
          manager.create(Group, {
            principalId: principal.id,
            tenantId: input.tenantId,
            name: input.name,
            description: input.description ?? null,
          }),
        );
      } catch (error) {
        if (isUniqueConstraintViolationError(error)) {
          throw new DuplicateEntryError(
            'name',
            `Group name "${input.name}" is already in use in this tenant.`,
          );
        }
        throw error;
      }
    });
  }

  /**
   * Looks up a group by name within a tenant (names are only unique per
   * tenant, not globally).
   *
   * @returns The group, or `null` if no group has that name in that
   * tenant.
   */
  async findGroupByName(tenantId: string, name: string): Promise<Group | null> {
    return this.dataSource.getRepository(Group).findOneBy({ tenantId, name });
  }

  /**
   * Deletes a group and every `GroupMembership` row that references it —
   * both rows where it's the group being listed, and rows where its
   * principal is a *member* of some other group — so no membership row
   * is left pointing at a group that no longer exists. Its `Principal`
   * row is left in place (ACEs may still reference it; removing it is a
   * separate concern for a later milestone).
   *
   * @throws {@link NotFoundError} If no group has `groupId`.
   */
  async deleteGroup(groupId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const group = await manager.findOneBy(Group, { id: groupId });
      if (!group) {
        throw new NotFoundError(`Group "${groupId}" not found.`);
      }
      await manager.delete(GroupMembership, { groupId: group.id });
      await manager.delete(GroupMembership, {
        memberPrincipalId: group.principalId,
      });
      await manager.delete(Group, { id: group.id });
    });
  }
}
