import type { ColumnType } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Principal } from './principal.entity.js';
import { Tenant } from './tenant.entity.js';

/**
 * The iTIP method (RFC 5546) a {@link SchedulingInboxItem} carries — the
 * scope RFC 6638 implicit scheduling is limited to
 * (planning/01-decisions.md, Runde 22): no `COUNTER`/`DECLINECOUNTER`/
 * `ADD`.
 */
export const SCHEDULING_METHODS = ['REQUEST', 'REPLY', 'CANCEL'] as const;

/** One of {@link SCHEDULING_METHODS}. */
export type SchedulingMethod = (typeof SCHEDULING_METHODS)[number];

/**
 * Cross-driver column type for {@link SchedulingInboxItem.icsData}: a
 * plain `text` column on every engine except MySQL/MariaDB, where `text`
 * holds at most 64 KiB — too small for a `REQUEST` carrying an event with
 * a long description or an inline `ATTACH` — so `longtext`. Same
 * reasoning, resolved the same way (from `DAVNODE_DB_TYPE` at import
 * time), as `CalendarObjectContent.icsData`.
 */
const ICS_COLUMN_TYPE: ColumnType =
  process.env.DAVNODE_DB_TYPE === 'mysql' ? 'longtext' : 'text';

/**
 * One iTIP message (RFC 5546) delivered into a user's scheduling inbox
 * (RFC 6638 §2.2) by this server's implicit-scheduling machinery
 * (planning/01-decisions.md, Runde 22): a `REQUEST` (a new invite, or an
 * organizer's update to one), a `REPLY` (an attendee's `PARTSTAT`
 * answer) or a `CANCEL`.
 *
 * Deliberately outside every resource domain's usual ACE/lock/change-log
 * table set (`calendar_aces`, `calendar_locks`, `calendar_changes`, ...):
 * a personal mailbox needs no RFC 3744 sharing, so access is simply
 * "matches `ownerPrincipalId`" wherever this is queried — see
 * `milestones/M7-caldav-scheduling/07-scheduling-privileges-and-routes`.
 *
 * More than one item may share the same {@link SchedulingInboxItem.uid}
 * — e.g. a `REQUEST` followed later by a `CANCEL` for the same event.
 * This table is an append-only log of what arrived, not a single
 * current-state row per event; {@link SchedulingInboxItem.uid} exists to
 * correlate those arrivals with each other and with the recipient's own
 * copy of the event (`milestones/M7-caldav-scheduling/04-attendee-reply-workflow`).
 */
@Entity('scheduling_inbox_items')
@Index(['tenantId', 'ownerPrincipalId'])
@Index(['uid'])
export class SchedulingInboxItem {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the tenant this inbox item belongs to. */
  @Column({ type: 'uuid' })
  tenantId!: string;

  /** The tenant this inbox item belongs to. */
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  /** Id of the principal whose inbox this item is in. */
  @Column({ type: 'uuid' })
  ownerPrincipalId!: string;

  /** The principal whose inbox this item is in. */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'owner_principal_id' })
  ownerPrincipal!: Principal;

  /** The raw iTIP message text: a `VCALENDAR` with `METHOD:REQUEST`/`REPLY`/`CANCEL` and one `VEVENT`. */
  @Column({ type: ICS_COLUMN_TYPE })
  icsData!: string;

  /** The iTIP method this item carries. */
  @Column({ type: 'simple-enum', enum: SCHEDULING_METHODS })
  method!: SchedulingMethod;

  /**
   * The scheduled event's iCalendar `UID` — correlates this item with
   * the recipient's own copy of the event, and with any other inbox
   * item about the same event.
   */
  @Column({ type: 'varchar' })
  uid!: string;

  /** Opaque version identifier (`DAV:getetag`). */
  @Column({ type: 'varchar' })
  etag!: string;

  /** Timestamp this item was delivered. */
  @CreateDateColumn()
  createdAt!: Date;
}
