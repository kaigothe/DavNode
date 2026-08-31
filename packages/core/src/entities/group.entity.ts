import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Principal } from './principal.entity.js';
import { Tenant } from './tenant.entity.js';

/**
 * A group, owning exactly one {@link Principal} (1:1) that ACEs can grant
 * privileges to. `name` is unique per tenant, not globally. Membership is
 * tracked separately via `GroupMembership`.
 */
@Entity('groups')
@Index(['tenantId', 'name'], { unique: true })
export class Group {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the principal this group owns. */
  @Column({ type: 'uuid', unique: true })
  principalId!: string;

  /** The principal this group owns. */
  @OneToOne(() => Principal)
  @JoinColumn({ name: 'principal_id' })
  principal!: Principal;

  /** Id of the tenant this group belongs to. */
  @Column({ type: 'uuid' })
  tenantId!: string;

  /** The tenant this group belongs to. */
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  /** Display name, unique within the group's tenant. */
  @Column({ type: 'varchar' })
  name!: string;

  /** Optional free-text description. */
  @Column({ type: 'varchar', nullable: true })
  description!: string | null;
}
