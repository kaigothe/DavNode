import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Principal } from './principal.entity.js';
import { Tenant } from './tenant.entity.js';

/**
 * A CardDAV addressbook (RFC 6352) owned by a single principal.
 *
 * Unlike `Collection` (the WebDAV domain's folder entity), addressbooks
 * don't nest — there is deliberately no self-referencing parent column.
 * All of a user's addressbooks are surfaced flat under a virtual, not
 * persisted home collection at `/dav/{tenant}/addressbooks/{userId}/`
 * (RFC 6352 §7.1.1, see planning/01-decisions.md, Runde 20). A principal
 * may own more than one addressbook, so — unlike `Collection`'s
 * one-root-per-tenant invariant — there is no unique constraint on
 * `ownerPrincipalId`.
 *
 * Table name follows the `addressbook_*` prefix shared with this
 * domain's other tables (`addressbook_aces`, `addressbook_locks`,
 * `addressbook_changes`, `addressbook_properties`), rather than the
 * `AddressbookCollection` class name, for consistency with those FKs.
 */
@Entity('addressbooks')
@Index(['tenantId', 'ownerPrincipalId'])
export class AddressbookCollection {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the tenant this addressbook belongs to. */
  @Column({ type: 'uuid' })
  tenantId!: string;

  /** The tenant this addressbook belongs to. */
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  /** Id of the principal that owns this addressbook. */
  @Column({ type: 'uuid' })
  ownerPrincipalId!: string;

  /** The principal that owns this addressbook. */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'owner_principal_id' })
  ownerPrincipal!: Principal;

  /** Display name (`DAV:displayname`). */
  @Column({ type: 'varchar' })
  displayName!: string;

  /** Description (`CARD:addressbook-description`), if set by the client. */
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Monotonically increasing counter, bumped on every change to a direct
   * child (`AddressObject`) — the value handed to clients as a
   * `sync-collection` sync token (see M4's sync-collection REPORT).
   */
  @Column({ type: 'int', default: 0 })
  syncSeq!: number;

  /** Timestamp of addressbook creation. */
  @CreateDateColumn()
  createdAt!: Date;

  /** Timestamp of the last change to this addressbook's own properties. */
  @UpdateDateColumn()
  updatedAt!: Date;
}
