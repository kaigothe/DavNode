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
import { componentSetColumnTransformer } from './component-set-column.transformer.js';
import { Principal } from './principal.entity.js';
import { Tenant } from './tenant.entity.js';

/**
 * The iCalendar component types a `CalendarObject` (and a calendar's
 * `supportedComponentSet`) can hold. v1 stores `VEVENT` only — `VTODO`/
 * `VJOURNAL` need their own time-range semantics (`DUE` instead of
 * `DTSTART`/`DTEND`, see planning/03-open-questions.md). Extending the
 * set later means adding a value here; see `CalendarObject.componentType`
 * for the database-level consequence.
 */
export const CALENDAR_COMPONENT_TYPES = ['VEVENT'] as const;

/** One of {@link CALENDAR_COMPONENT_TYPES}. */
export type CalendarComponentType = (typeof CALENDAR_COMPONENT_TYPES)[number];

/**
 * A CalDAV calendar collection (RFC 4791) owned by a single principal.
 *
 * Like `AddressbookCollection`, and unlike `Collection` (the WebDAV
 * domain's folder entity), calendars don't nest — there is deliberately
 * no self-referencing parent column. All of a user's calendars are
 * surfaced flat under a virtual, not persisted home collection at
 * `/dav/{tenant}/calendars/{userId}/` (RFC 4791 §5.2.1, see
 * planning/01-decisions.md, Runde 21). A principal may own any number of
 * calendars, so there is no unique constraint on `ownerPrincipalId`.
 *
 * Table name follows the `calendar_*` prefix shared with this domain's
 * other tables (`calendar_aces`, `calendar_locks`, `calendar_changes`,
 * `calendar_properties`), rather than the class name, for consistency
 * with those FKs.
 */
@Entity('calendars')
@Index(['tenantId', 'ownerPrincipalId'])
export class CalendarCollection {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the tenant this calendar belongs to. */
  @Column({ type: 'uuid' })
  tenantId!: string;

  /** The tenant this calendar belongs to. */
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  /** Id of the principal that owns this calendar. */
  @Column({ type: 'uuid' })
  ownerPrincipalId!: string;

  /** The principal that owns this calendar. */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'owner_principal_id' })
  ownerPrincipal!: Principal;

  /** Display name (`DAV:displayname`). */
  @Column({ type: 'varchar' })
  displayName!: string;

  /** Description (`CALDAV:calendar-description`), if set by the client. */
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * The component types this calendar accepts
   * (`CALDAV:supported-calendar-component-set`, RFC 4791 §5.2.3).
   * Defaults to `['VEVENT']`, the only type v1 supports; modelled as a
   * set so adding `VTODO` later is a data change, not a schema change.
   * Stored as one comma-separated `varchar` (see
   * `componentSetColumnTransformer`).
   */
  @Column({
    type: 'varchar',
    default: 'VEVENT',
    transformer: componentSetColumnTransformer,
  })
  supportedComponentSet!: CalendarComponentType[];

  /**
   * The calendar's time zone (`CALDAV:calendar-timezone`, RFC 4791
   * §5.2.2): the raw `VTIMEZONE`-carrying iCalendar text, or a plain
   * `TZID`. `null` when the client never set one.
   */
  @Column({ type: 'text', nullable: true })
  timezone!: string | null;

  /**
   * Secret path token of the calendar's read-only ICS feed
   * (`.../feed/{token}.ics`, planning/01-decisions.md Runde 21). `null`
   * — the default — means the feed is disabled until first generated;
   * set, it is unique across all calendars so the token alone identifies
   * the calendar. Regenerating overwrites it, which revokes the old one.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  icsFeedToken!: string | null;

  /**
   * Monotonically increasing counter, bumped on every change to a direct
   * child (`CalendarObject`) — the value handed to clients as a
   * `sync-collection` sync token.
   */
  @Column({ type: 'int', default: 0 })
  syncSeq!: number;

  /** Timestamp of calendar creation. */
  @CreateDateColumn()
  createdAt!: Date;

  /** Timestamp of the last change to this calendar's own properties. */
  @UpdateDateColumn()
  updatedAt!: Date;
}
