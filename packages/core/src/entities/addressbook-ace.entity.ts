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
import { AddressbookCollection } from './addressbook-collection.entity.js';
import { GRANT_DENY_VALUES, type GrantDeny } from './collection-ace.entity.js';
import { Principal } from './principal.entity.js';

/**
 * An access control entry (ACE, RFC 3744) on an {@link AddressbookCollection}.
 * Mirrors `CollectionAce` (M3) for the addressbook domain — same
 * `position`-ordered evaluation, `protected` semantics, and reused
 * {@link Privilege}/{@link GrantDeny} vocabulary (both are plain value
 * vocabularies, not domain-specific data, so the M3 ACL evaluation
 * engine works against this table without modification; see
 * `Privilege`'s own doc comment).
 *
 * `AddressObjectAce` is the object-level analog for `AddressObject`, the
 * same per-domain-and-level table split as `CollectionAce`/`FileAce`.
 */
@Entity('addressbook_aces')
@Index(['addressbookId', 'position'])
export class AddressbookAce {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the addressbook this ACE applies to. */
  @Column({ type: 'uuid' })
  addressbookId!: string;

  /** The addressbook this ACE applies to. */
  @ManyToOne(() => AddressbookCollection)
  @JoinColumn({ name: 'addressbook_id' })
  addressbook!: AddressbookCollection;

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
   * Evaluation order among this addressbook's own ACEs (ascending, RFC
   * 3744 is order-sensitive — see the ACL evaluation engine). Not
   * database-enforced as unique: the evaluation engine only relies on
   * relative order, not on any particular value being taken.
   */
  @Column({ type: 'int' })
  position!: number;

  /** Timestamp this ACE was created. */
  @CreateDateColumn()
  createdAt!: Date;
}
