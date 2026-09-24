import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CalendarCollection } from './calendar-collection.entity.js';

/**
 * A "dead property" (RFC 4918) on a {@link CalendarCollection}: an
 * arbitrary, client-set property the server doesn't itself interpret, but
 * must persist and return as-is (via PROPPATCH/PROPFIND). Unique per
 * `(calendarId, namespace, name)` — setting the same property again
 * overwrites its value rather than creating a duplicate. Mirrors
 * `AddressbookProperty` (M5) and `CollectionProperty` (M2) for the
 * calendar domain.
 *
 * **Live properties** (`displayname`, `getetag`, `getlastmodified`,
 * `resourcetype`, `CALDAV:calendar-description`,
 * `CALDAV:calendar-timezone`, `CALDAV:supported-calendar-component-set`)
 * are **not** stored here — they're derived from
 * `CalendarCollection`'s own fixed columns instead.
 */
@Entity('calendar_properties')
@Index(['calendarId', 'namespace', 'name'], { unique: true })
export class CalendarProperty {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the calendar this property is set on. */
  @Column({ type: 'uuid' })
  calendarId!: string;

  /** The calendar this property is set on. */
  @ManyToOne(() => CalendarCollection)
  @JoinColumn({ name: 'calendar_id' })
  calendar!: CalendarCollection;

  /** XML namespace URI (e.g. `DAV:`, or a client-defined namespace). */
  @Column({ type: 'varchar' })
  namespace!: string;

  /** Local property name within this row's `namespace`. */
  @Column({ type: 'varchar' })
  name!: string;

  /** The property's value, as text (may be an XML fragment). */
  @Column({ type: 'text' })
  value!: string;
}
