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
import {
  CALENDAR_COMPONENT_TYPES,
  CalendarCollection,
  type CalendarComponentType,
} from './calendar-collection.entity.js';
import { epochMillisDateTransformer } from './epoch-millis-date.transformer.js';
import { Principal } from './principal.entity.js';
import { Tenant } from './tenant.entity.js';

/** How a calendar object shows up in free/busy time (`TRANSP`, RFC 5545 §3.8.2.7). */
export const CALENDAR_TRANSPARENCY_VALUES = ['opaque', 'transparent'] as const;

/** One of {@link CALENDAR_TRANSPARENCY_VALUES}. */
export type CalendarTransparency =
  (typeof CALENDAR_TRANSPARENCY_VALUES)[number];

/** The `STATUS` of an event (RFC 5545 §3.8.1.11). */
export const CALENDAR_STATUS_VALUES = [
  'tentative',
  'confirmed',
  'cancelled',
] as const;

/** One of {@link CALENDAR_STATUS_VALUES}. */
export type CalendarStatus = (typeof CALENDAR_STATUS_VALUES)[number];

/**
 * A CalDAV calendar object resource (RFC 4791 §4.1) — one URL, one ETag —
 * inside a {@link CalendarCollection}. Its raw iCalendar text lives
 * separately, in `CalendarObjectContent` (the same metadata/blob split as
 * `AddressObject`/`FileResource`), so PROPFIND and `calendar-query`
 * prefiltering never load and re-parse every event's `VCALENDAR`.
 *
 * **One object, several components**: a single object holds *all*
 * `VEVENT`s sharing one `UID` — the master event (with an optional
 * `RRULE`) plus a `RECURRENCE-ID` override for each individually changed
 * instance. Everything below describes the *master's* schedule; the
 * index population (`milestones/M6-caldav/02-icalendar-parsing-and-time-range-index`)
 * must take the overrides into account when it derives
 * `recurrenceSpanEnd`.
 *
 * **Two identities**, both unique within the calendar: `name` is this
 * resource's own URL path segment, client-chosen via PUT's target URL
 * (like `AddressObject.name`, `FileResource.name`) — an object must be
 * found again at exactly the URL it was created at, and clients often
 * name a resource differently from its `UID`. `uid` is the iCalendar
 * `UID`, which RFC 4791 §5.3.2.1 (`no-uid-conflict`) requires to be
 * unique per calendar collection; the database constraint is the
 * race-safe backstop for the application-level `409`. (Added over the
 * original plan, which named only `uid`: M5 had to retrofit `name`
 * onto `AddressObject` for the same reason.)
 *
 * **The time-range index columns** (`dtstart`, `dtend`,
 * `recurrenceSpanEnd`) live directly on this row rather than in a
 * separate table like `AddressObjectIndex`: a vCard property is
 * multi-valued (several `EMAIL`s per contact), an object's time span is
 * single-valued, so a join would only add cost (planning/01-decisions.md,
 * Runde 21). They're stored as epoch milliseconds — see
 * `epochMillisDateTransformer` for why not `timestamp`/`datetime`.
 */
@Entity('calendar_objects')
@Index(['calendarId', 'name'], { unique: true })
@Index(['calendarId', 'uid'], { unique: true })
@Index(['calendarId', 'dtstart', 'recurrenceSpanEnd'])
export class CalendarObject {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the tenant this calendar object belongs to. */
  @Column({ type: 'uuid' })
  tenantId!: string;

  /** The tenant this calendar object belongs to. */
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  /** Id of the parent calendar. */
  @Column({ type: 'uuid' })
  calendarId!: string;

  /** The parent calendar. */
  @ManyToOne(() => CalendarCollection)
  @JoinColumn({ name: 'calendar_id' })
  calendar!: CalendarCollection;

  /**
   * This resource's own path segment (e.g. `meeting.ics`), unique within
   * {@link CalendarObject.calendar} — the URL identity PUT/GET/DELETE
   * resolve by, client-chosen exactly like `AddressObject.name`.
   */
  @Column({ type: 'varchar' })
  name!: string;

  /**
   * The iCalendar `UID` shared by the master event and all its
   * `RECURRENCE-ID` overrides; unique within
   * {@link CalendarObject.calendar} (RFC 4791 §5.3.2.1).
   */
  @Column({ type: 'varchar' })
  uid!: string;

  /** Opaque version identifier (`DAV:getetag`), changed on every write. */
  @Column({ type: 'varchar' })
  etag!: string;

  /**
   * The kind of component this object holds. v1 stores `VEVENT` only
   * ({@link CALENDAR_COMPONENT_TYPES}); adding a type means extending the
   * database enum (an `ALTER` on Postgres and MySQL, a table rebuild on
   * SQLite) through a migration.
   */
  @Column({ type: 'simple-enum', enum: CALENDAR_COMPONENT_TYPES })
  componentType!: CalendarComponentType;

  /** Id of the principal that owns this calendar object. */
  @Column({ type: 'uuid' })
  ownerPrincipalId!: string;

  /** The principal that owns this calendar object. */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'owner_principal_id' })
  ownerPrincipal!: Principal;

  /** The master event's `DTSTART`, as an instant. */
  @Column({ type: 'bigint', transformer: epochMillisDateTransformer })
  dtstart!: Date;

  /**
   * The master event's `DTEND` — or, when the event only has a
   * `DURATION`, `DTSTART` plus that duration (the index population must
   * convert, not pass `null` through). `null` only for an event that has
   * neither.
   */
  @Column({
    type: 'bigint',
    nullable: true,
    transformer: epochMillisDateTransformer,
  })
  dtend!: Date | null;

  /** `DTSTART`/`DTEND` are `DATE` values rather than `DATE-TIME`: an all-day event. */
  @Column({ type: 'boolean', default: false })
  isAllDay!: boolean;

  /**
   * The end of the last recurrence instance: `UNTIL` for an `RRULE` that
   * has one, the computed last instance for one with `COUNT`, and `dtend`
   * for a non-recurring event. `null` means the recurrence never ends
   * (an `RRULE` with neither `UNTIL` nor `COUNT`) — such an object must
   * match every time range that starts after `dtstart`.
   */
  @Column({
    type: 'bigint',
    nullable: true,
    transformer: epochMillisDateTransformer,
  })
  recurrenceSpanEnd!: Date | null;

  /** `TRANSP`: whether the event blocks time in `free-busy-query`. Defaults to `opaque`. */
  @Column({
    type: 'simple-enum',
    enum: CALENDAR_TRANSPARENCY_VALUES,
    default: 'opaque',
  })
  transparency!: CalendarTransparency;

  /** `STATUS`; `null` means the property is absent, which counts as `confirmed`. */
  @Column({
    type: 'simple-enum',
    enum: CALENDAR_STATUS_VALUES,
    nullable: true,
  })
  status!: CalendarStatus | null;

  /** Timestamp of calendar object creation (`DAV:creationdate`). */
  @CreateDateColumn()
  createdAt!: Date;

  /** Timestamp of the last write (`DAV:getlastmodified`). */
  @UpdateDateColumn()
  updatedAt!: Date;
}
