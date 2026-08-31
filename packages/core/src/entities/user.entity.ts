import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bigintColumnTransformer } from './bigint-column.transformer.js';
import { Principal } from './principal.entity.js';
import { Tenant } from './tenant.entity.js';

/**
 * A user's role, gating server- and tenant-admin capabilities. Defaults to
 * `'member'`; the M1 bootstrap user (see the seed/bootstrap tooling) is
 * created with `'server_admin'`.
 */
export type UserRole = 'member' | 'tenant_admin' | 'server_admin';

/** All valid {@link UserRole} values. */
export const USER_ROLES: readonly UserRole[] = [
  'member',
  'tenant_admin',
  'server_admin',
];

/**
 * A user account, owning exactly one {@link Principal} (1:1) plus profile
 * data and its own storage quota (in addition to the tenant-wide quota on
 * {@link Tenant}). `username` is unique per tenant, not globally — the
 * same username may exist in different tenants.
 *
 * `tenantId` duplicates `Principal.tenantId` so tenant-scoped queries
 * don't need to join through `principals`; keeping the two in sync is the
 * responsibility of the service layer that creates users, not this
 * entity.
 */
@Entity('users')
@Index(['tenantId', 'username'], { unique: true })
export class User {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the principal this user owns. */
  @Column({ type: 'uuid', unique: true })
  principalId!: string;

  /** The principal this user owns. */
  @OneToOne(() => Principal)
  @JoinColumn({ name: 'principal_id' })
  principal!: Principal;

  /**
   * Id of the tenant this user belongs to. Must match the tenant of
   * {@link User.principal} — see the class-level note.
   */
  @Column({ type: 'uuid' })
  tenantId!: string;

  /** The tenant this user belongs to. */
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  /** Login name, unique within the user's tenant. */
  @Column({ type: 'varchar' })
  username!: string;

  /** Contact email address. */
  @Column({ type: 'varchar' })
  email!: string;

  /**
   * Per-user storage quota in bytes, in addition to the tenant-wide quota.
   * `null` means no user-level limit is enforced.
   */
  @Column({
    type: 'bigint',
    nullable: true,
    transformer: bigintColumnTransformer,
  })
  quotaLimitBytes!: number | null;

  /** Running total of bytes currently stored by this user. */
  @Column({
    type: 'bigint',
    default: 0,
    transformer: bigintColumnTransformer,
  })
  quotaUsedBytes!: number;

  /** Server-/tenant-admin capability level. */
  @Column({ type: 'simple-enum', enum: USER_ROLES, default: 'member' })
  role!: UserRole;

  /** Timestamp of user creation. */
  @CreateDateColumn()
  createdAt!: Date;
}
