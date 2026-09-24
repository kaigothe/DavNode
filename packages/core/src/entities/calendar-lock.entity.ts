import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CalendarCollection } from './calendar-collection.entity.js';
import {
  LOCK_DEPTH_VALUES,
  LOCK_SCOPE_VALUES,
  type LockDepth,
  type LockScope,
} from './collection-lock.entity.js';
import { Principal } from './principal.entity.js';

/**
 * A WebDAV lock (RFC 4918 §7–9) held on a {@link CalendarCollection}.
 * Mirrors `CollectionLock` (M4) and `AddressbookLock` (M5) for the
 * calendar domain, reusing the {@link LockScope}/{@link LockDepth}
 * vocabulary (plain value vocabularies, not domain-specific data).
 *
 * `CalendarObjectLock` is the object-level analog for `CalendarObject`.
 * `token` is unique across every row in this table, not merely per
 * calendar — see `CollectionLock` for the lookup rationale.
 */
@Entity('calendar_locks')
export class CalendarLock {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the calendar this lock applies to. */
  @Column({ type: 'uuid' })
  calendarId!: string;

  /** The calendar this lock applies to. */
  @ManyToOne(() => CalendarCollection)
  @JoinColumn({ name: 'calendar_id' })
  calendar!: CalendarCollection;

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

  /** Whether this lock also covers every calendar object in the calendar. */
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
   * `timeoutSeconds` is `null` (`Infinite`).
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
