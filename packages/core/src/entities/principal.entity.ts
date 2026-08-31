import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity.js';

/** The three kinds of {@link Principal}: a user, a group, or a special principal. */
export type PrincipalKind = 'user' | 'group' | 'special';

/** All valid {@link PrincipalKind} values. */
export const PRINCIPAL_KINDS: readonly PrincipalKind[] = [
  'user',
  'group',
  'special',
];

/**
 * Which RFC 3744 special principal a {@link Principal} row represents.
 * Only meaningful (and only ever set) when `kind` is `'special'`.
 */
export type PrincipalSpecialKind =
  'authenticated' | 'unauthenticated' | 'all' | 'owner' | 'self';

/** All valid {@link PrincipalSpecialKind} values. */
export const PRINCIPAL_SPECIAL_KINDS: readonly PrincipalSpecialKind[] = [
  'authenticated',
  'unauthenticated',
  'all',
  'owner',
  'self',
];

/**
 * A principal: the common identity every ACL entry (RFC 3744) refers to.
 * `User` and `Group` each own exactly one `Principal` row; the RFC 3744
 * special principals (`DAV:authenticated`, `DAV:all`, ...) are `Principal`
 * rows too, but with `kind = 'special'` and no owning `User`/`Group` row.
 *
 * Special principals are per-tenant, not global singletons — each tenant
 * gets its own `all`/`authenticated`/`unauthenticated` rows (populated by
 * the seed/bootstrap tooling, not here).
 */
@Entity('principals')
@Index(['tenantId', 'kind'])
export class Principal {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the tenant this principal belongs to. */
  @Column({ type: 'uuid' })
  tenantId!: string;

  /** The tenant this principal belongs to. */
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  /** Whether this principal is a user, a group, or an RFC 3744 special principal. */
  @Column({ type: 'simple-enum', enum: PRINCIPAL_KINDS })
  kind!: PrincipalKind;

  /**
   * Which special principal this is; `null` unless `kind` is `'special'`
   * (enforced by {@link Principal.validateSpecialKind}).
   */
  @Column({
    type: 'simple-enum',
    enum: PRINCIPAL_SPECIAL_KINDS,
    nullable: true,
  })
  specialKind!: PrincipalSpecialKind | null;

  /**
   * Rejects rows where `specialKind` is set without `kind` being
   * `'special'`, or vice versa. Runs automatically before insert/update;
   * not meant to be called directly.
   */
  @BeforeInsert()
  @BeforeUpdate()
  validateSpecialKind(): void {
    const isSpecial = this.kind === 'special';
    const hasSpecialKind = this.specialKind != null;
    if (isSpecial !== hasSpecialKind) {
      throw new Error(
        `Invalid principal: specialKind must be set if and only if kind is "special" (kind="${this.kind}", specialKind=${JSON.stringify(this.specialKind)}).`,
      );
    }
  }
}
