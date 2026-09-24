import type { ColumnType } from 'typeorm';
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CalendarObject } from './calendar-object.entity.js';

/**
 * Cross-driver column type for {@link CalendarObjectContent.icsData}: a
 * plain `text` column on every engine except MySQL/MariaDB, where `text`
 * holds at most 64 KiB — too small for an event with a long description
 * or an inline `ATTACH` — so `longtext`. Resolved once from
 * `DAVNODE_DB_TYPE`, like `FileContent`'s blob type, since a process only
 * ever targets one database engine.
 */
const ICS_COLUMN_TYPE: ColumnType =
  process.env.DAVNODE_DB_TYPE === 'mysql' ? 'longtext' : 'text';

/**
 * The raw iCalendar text of a {@link CalendarObject} — the complete
 * `VCALENDAR` wrapper with the master event and every `RECURRENCE-ID`
 * override of the same `UID` — split into its own table (mirroring
 * `AddressObjectContent`/`FileContent`) so PROPFIND and index lookups
 * never have to load every event's full body. Text, not a blob:
 * iCalendar is always UTF-8 (RFC 5545 §3.1.4).
 */
@Entity('calendar_object_contents')
export class CalendarObjectContent {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the calendar object this content belongs to. */
  @Column({ type: 'uuid', unique: true })
  calendarObjectId!: string;

  /**
   * The calendar object this content belongs to. Deleting the object
   * deletes its content too (`ON DELETE CASCADE`) — the two are always
   * created and deleted together at the service level (PUT/DELETE), and
   * content has no meaning on its own.
   */
  @OneToOne(() => CalendarObject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'calendar_object_id' })
  calendarObject!: CalendarObject;

  /** The raw iCalendar text. */
  @Column({ type: ICS_COLUMN_TYPE })
  icsData!: string;
}
