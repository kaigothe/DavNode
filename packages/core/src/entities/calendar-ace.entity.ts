import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  CALENDAR_PRIVILEGES,
  type CalendarPrivilege,
} from '../acl/privilege.js';
import { CalendarCollection } from './calendar-collection.entity.js';
import { GRANT_DENY_VALUES, type GrantDeny } from './collection-ace.entity.js';
import { Principal } from './principal.entity.js';

/**
 * An access control entry (ACE, RFC 3744) on a {@link CalendarCollection}.
 * Mirrors `CollectionAce` (M3) and `AddressbookAce` (M5) for the calendar
 * domain — same `position`-ordered evaluation, `protected` semantics and
 * {@link GrantDeny} vocabulary.
 *
 * The one difference is the privilege vocabulary:
 * {@link CalendarPrivilege} is the shared catalog plus
 * `CALDAV:read-free-busy` (RFC 4791 §6.1.1), which only calendars know —
 * see there for why it isn't part of the shared `Privilege`.
 *
 * `CalendarObjectAce` is the object-level analog for `CalendarObject`,
 * the same per-domain-and-level table split as `CollectionAce`/`FileAce`.
 */
@Entity('calendar_aces')
@Index(['calendarId', 'position'])
export class CalendarAce {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the calendar this ACE applies to. */
  @Column({ type: 'uuid' })
  calendarId!: string;

  /** The calendar this ACE applies to. */
  @ManyToOne(() => CalendarCollection)
  @JoinColumn({ name: 'calendar_id' })
  calendar!: CalendarCollection;

  /** Id of the principal this ACE grants or denies `privilege` to. */
  @Column({ type: 'uuid' })
  principalId!: string;

  /** The principal this ACE grants or denies `privilege` to. */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'principal_id' })
  principal!: Principal;

  /** The privilege this ACE controls access to. */
  @Column({ type: 'simple-enum', enum: CALENDAR_PRIVILEGES })
  privilege!: CalendarPrivilege;

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
   * Evaluation order among this calendar's own ACEs (ascending, RFC 3744
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
