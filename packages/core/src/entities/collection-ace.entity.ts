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
import { Collection } from './collection.entity.js';
import { Principal } from './principal.entity.js';

/** Whether an ACE grants or denies its `privilege` (RFC 3744 §5.5). */
export type GrantDeny = 'grant' | 'deny';

/** All valid {@link GrantDeny} values. */
export const GRANT_DENY_VALUES: readonly GrantDeny[] = ['grant', 'deny'];

/**
 * An access control entry (ACE, RFC 3744) on a {@link Collection}. A
 * collection's effective ACL is the ordered set of its own `CollectionAce`
 * rows, evaluated by `position` (ascending, first match per privilege
 * wins — see the ACL evaluation engine,
 * milestones/M3-webdav-acl/03-acl-evaluation-engine) merged with ACEs
 * inherited from ancestor collections.
 *
 * `protected` marks system-managed ACEs — currently only the
 * default-owner ACE created by `createOwnerAllAce`
 * (milestones/M3-webdav-acl/01-ace-entities-and-privileges/03-default-owner-ace-utility.md)
 * — which the `ACL` HTTP method must refuse to remove.
 *
 * `FileAce` is the object-level analog for `FileResource` (Runde 12: ACEs
 * are allowed on both collection and object level, one dedicated table
 * per domain and level rather than a generic/polymorphic ACE table).
 */
@Entity('collection_aces')
@Index(['collectionId', 'position'])
export class CollectionAce {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the collection this ACE applies to. */
  @Column({ type: 'uuid' })
  collectionId!: string;

  /** The collection this ACE applies to. */
  @ManyToOne(() => Collection)
  @JoinColumn({ name: 'collection_id' })
  collection!: Collection;

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
   * Evaluation order among this collection's own ACEs (ascending, RFC 3744
   * is order-sensitive — see the ACL evaluation engine). Not
   * database-enforced as unique: the evaluation engine only relies on
   * relative order, not on any particular value being taken.
   */
  @Column({ type: 'int' })
  position!: number;

  /** Timestamp this ACE was created. */
  @CreateDateColumn()
  createdAt!: Date;
}
