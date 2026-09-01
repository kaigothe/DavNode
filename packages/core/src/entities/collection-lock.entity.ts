import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Collection } from './collection.entity.js';
import { Principal } from './principal.entity.js';

/**
 * Whether a lock excludes every other lock holder (`exclusive`) or may
 * coexist with other locks of the same scope (`shared`), RFC 4918 §7.
 */
export type LockScope = 'exclusive' | 'shared';

/** All valid {@link LockScope} values. */
export const LOCK_SCOPE_VALUES: readonly LockScope[] = ['exclusive', 'shared'];

/**
 * Whether a {@link CollectionLock} applies only to the collection itself
 * (`zero`) or also to every descendant (`infinity`, RFC 4918 §9.10.4). No
 * row is written per descendant either way — whether a descendant
 * resource is locked is determined at check time by walking up to the
 * root, the same technique `collectAces` (M3) uses for ACE inheritance
 * (see milestones/M4-locking-sync/00-setting-goal.md).
 */
export type LockDepth = 'zero' | 'infinity';

/** All valid {@link LockDepth} values. */
export const LOCK_DEPTH_VALUES: readonly LockDepth[] = ['zero', 'infinity'];

/**
 * A WebDAV lock (RFC 4918 §7–9) held on a {@link Collection}. `FileLock`
 * is the object-level analog for `FileResource` — LOCK can address any
 * resource URI, not just collections, the same per-domain-and-level
 * table split as `CollectionAce`/`FileAce` (M3).
 *
 * `token` is the opaque lock token returned to the client
 * (`urn:uuid:<uuid>`, RFC 4918 §6.5) and is unique across every row in
 * this table, not merely per collection — it is looked up directly (by
 * the UNLOCK handler and by `If`-header validation) without first
 * knowing which resource it belongs to.
 */
@Entity('collection_locks')
export class CollectionLock {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the collection this lock applies to. */
  @Column({ type: 'uuid' })
  collectionId!: string;

  /** The collection this lock applies to. */
  @ManyToOne(() => Collection)
  @JoinColumn({ name: 'collection_id' })
  collection!: Collection;

  /** Id of the principal that holds this lock. */
  @Column({ type: 'uuid' })
  principalId!: string;

  /** The principal that holds this lock. */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'principal_id' })
  principal!: Principal;

  /** Opaque lock token (`urn:uuid:<uuid>`), unique across all locks. */
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  token!: string;

  /** Whether this lock is exclusive or shared. */
  @Column({ type: 'simple-enum', enum: LOCK_SCOPE_VALUES })
  scope!: LockScope;

  /** Whether this lock also covers every descendant of the collection. */
  @Column({ type: 'simple-enum', enum: LOCK_DEPTH_VALUES })
  depth!: LockDepth;

  /**
   * Requested/granted lock lifetime in seconds; `null` means `Infinite`
   * (RFC 4918 §10.7).
   */
  @Column({ type: 'int', nullable: true })
  timeoutSeconds!: number | null;

  /**
   * When this lock expires (`createdAt` + `timeoutSeconds`); `null` when
   * `timeoutSeconds` is `null` (`Infinite`). `type: Date` (the
   * constructor, not a driver-specific string like `'timestamp'`/
   * `'datetime'`) lets each driver pick its own native type — no single
   * string type name is valid across Postgres, MySQL, *and* SQLite for a
   * nullable date/time column, and reflect-metadata can't infer `Date`
   * here on its own since `Date | null` erases to `Object` at runtime.
   */
  @Column({ type: Date, nullable: true })
  expiresAt!: Date | null;

  /**
   * The client-supplied `<D:owner>` element from the LOCK request body
   * (RFC 4918 §14.17), stored raw and returned unchanged in
   * `lockdiscovery`. `null` when the client omitted it — `<D:owner>` is
   * optional in `<D:lockinfo>`.
   */
  @Column({ type: 'text', nullable: true })
  ownerInfo!: string | null;

  /** Timestamp this lock was created. */
  @CreateDateColumn()
  createdAt!: Date;
}
