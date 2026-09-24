import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CalendarObject } from './calendar-object.entity.js';

/**
 * A "dead property" (RFC 4918) on a {@link CalendarObject}: an arbitrary,
 * client-set property the server doesn't itself interpret, but must
 * persist and return as-is (via PROPPATCH/PROPFIND). Unique per
 * `(calendarObjectId, namespace, name)` — setting the same property
 * again overwrites its value rather than creating a duplicate. Mirrors
 * `AddressObjectProperty` (M5) and `FileProperty` (M2) for the calendar
 * domain.
 *
 * **Live properties** (`getetag`, `getlastmodified`, `getcontenttype`,
 * `resourcetype`) are **not** stored here — they're derived from
 * `CalendarObject`'s own fixed columns instead.
 */
@Entity('calendar_object_properties')
@Index(['calendarObjectId', 'namespace', 'name'], { unique: true })
export class CalendarObjectProperty {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the calendar object this property is set on. */
  @Column({ type: 'uuid' })
  calendarObjectId!: string;

  /** The calendar object this property is set on. */
  @ManyToOne(() => CalendarObject)
  @JoinColumn({ name: 'calendar_object_id' })
  calendarObject!: CalendarObject;

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
