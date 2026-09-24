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
import { CalendarObject } from './calendar-object.entity.js';
import { GRANT_DENY_VALUES, type GrantDeny } from './collection-ace.entity.js';
import { Principal } from './principal.entity.js';

/**
 * An access control entry (ACE, RFC 3744) on a {@link CalendarObject} —
 * the object-level analog of `CalendarAce`. A calendar object's effective
 * ACL merges its own `CalendarObjectAce` rows (evaluated by `position`,
 * ascending) with the ACEs inherited from its calendar (see the ACL
 * evaluation engine, milestones/M3-webdav-acl/03-acl-evaluation-engine).
 *
 * See `CollectionAce`/`FileAce` (M3) for the shared field semantics
 * (`protected`, `position`) and the rationale for a dedicated
 * per-domain-and-level table instead of a generic/polymorphic ACE table
 * (Runde 11, 12), and {@link CalendarPrivilege} for the calendar-specific
 * privilege vocabulary.
 */
@Entity('calendar_object_aces')
@Index(['calendarObjectId', 'position'])
export class CalendarObjectAce {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the calendar object this ACE applies to. */
  @Column({ type: 'uuid' })
  calendarObjectId!: string;

  /** The calendar object this ACE applies to. */
  @ManyToOne(() => CalendarObject)
  @JoinColumn({ name: 'calendar_object_id' })
  calendarObject!: CalendarObject;

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
   * refuse to remove (e.g. the default-owner ACE).
   */
  @Column({ type: 'boolean', default: false })
  protected!: boolean;

  /**
   * Evaluation order among this calendar object's own ACEs (ascending).
   * Not database-enforced as unique: the evaluation engine only relies on
   * relative order.
   */
  @Column({ type: 'int' })
  position!: number;

  /** Timestamp this ACE was created. */
  @CreateDateColumn()
  createdAt!: Date;
}
