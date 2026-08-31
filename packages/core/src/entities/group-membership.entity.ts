import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Group } from './group.entity.js';
import { Principal } from './principal.entity.js';

/**
 * A single membership of a group: `memberPrincipal` may be a user's
 * principal, or **another group's** principal, which is what allows
 * groups to nest inside other groups. `(groupId, memberPrincipalId)` is
 * unique — a principal can't be added to the same group twice.
 *
 * Cycle detection (group A contains group B, which contains group A) is
 * intentionally **not** enforced here: a DB constraint on a single row
 * can't see the transitive chain across multiple membership rows needed
 * to detect a cycle. This must be implemented as application logic in the
 * repository/service layer (see the M1 Repository-/Service-Layer task)
 * when a membership is created — do not forget this when building it.
 */
@Entity('group_memberships')
@Index(['groupId', 'memberPrincipalId'], { unique: true })
export class GroupMembership {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the group this membership belongs to. */
  @Column({ type: 'uuid' })
  groupId!: string;

  /** The group this membership belongs to. */
  @ManyToOne(() => Group)
  @JoinColumn({ name: 'group_id' })
  group!: Group;

  /** Id of the member principal (a user's or another group's). */
  @Column({ type: 'uuid' })
  memberPrincipalId!: string;

  /** The member principal (a user's or another group's). */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'member_principal_id' })
  memberPrincipal!: Principal;
}
