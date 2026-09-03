import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ALL_PRIVILEGES, type Privilege } from '../acl/privilege.js';
import { GRANT_DENY_VALUES, type GrantDeny } from './collection-ace.entity.js';
import { AddressObject } from './address-object.entity.js';
import { Principal } from './principal.entity.js';

/**
 * An access control entry (ACE, RFC 3744) on an {@link AddressObject} —
 * the object-level analog of {@link AddressbookAce}. An address object's
 * effective ACL merges its own `AddressObjectAce` rows (evaluated by
 * `position`, ascending) with ACEs inherited from its parent addressbook
 * (see the ACL evaluation engine, milestones/M3-webdav-acl/03-acl-evaluation-engine).
 *
 * See `CollectionAce`/`FileAce` (M3) for the shared field semantics
 * (`protected`, `position`) and the rationale for a dedicated
 * per-domain-and-level table instead of a generic/polymorphic ACE table
 * (Runde 11, 12).
 */
@Entity('address_object_aces')
@Index(['addressObjectId', 'position'])
export class AddressObjectAce {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the address object this ACE applies to. */
  @Column({ type: 'uuid' })
  addressObjectId!: string;

  /** The address object this ACE applies to. */
  @ManyToOne(() => AddressObject)
  @JoinColumn({ name: 'address_object_id' })
  addressObject!: AddressObject;

  /** Id of the principal this ACE grants or denies `privilege` to. */
  @Column({ type: 'uuid' })
  principalId!: string;

  /** The principal this ACE grants or denies `privilege` to. */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'principal_id' })
  principal!: Principal;

  /** The privilege this ACE controls access to. */
  @Column({ type: 'simple-enum', enum: ALL_PRIVILEGES })
  privilege!: Privilege;

  /** Whether this ACE grants or denies `privilege` to `principal`. */
  @Column({ type: 'simple-enum', enum: GRANT_DENY_VALUES })
  grantDeny!: GrantDeny;

  /**
   * Whether this is a system-managed ACE that the `ACL` HTTP method must
   * refuse to remove (e.g. the default-owner ACE). Plain boolean flag, no
   * soft-delete mechanism needed alongside it.
   */
  @Column({ type: 'boolean', default: false })
  protected!: boolean;

  /**
   * Evaluation order among this address object's own ACEs (ascending,
   * RFC 3744 is order-sensitive — see the ACL evaluation engine). Not
   * database-enforced as unique: the evaluation engine only relies on
   * relative order, not on any particular value being taken.
   */
  @Column({ type: 'int' })
  position!: number;

  /** Timestamp this ACE was created. */
  @CreateDateColumn()
  createdAt!: Date;
}
