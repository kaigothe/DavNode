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
  COLLECTION_CHANGE_ACTIONS,
  type CollectionChangeAction,
} from './collection-change.entity.js';

/**
 * A change-log entry for one of a {@link CalendarCollection}'s direct
 * children (a `CalendarObject`) — added, modified, or deleted. Mirrors
 * `CollectionChange` (M4) and `AddressbookChange` (M5) for the calendar
 * domain, reusing the {@link CollectionChangeAction} vocabulary (a plain
 * value vocabulary, not domain-specific data).
 *
 * `name` denormalizes the changed `CalendarObject`'s own path segment
 * (`CalendarObject.name`), exactly like `CollectionChange.name` does for
 * the WebDAV domain: a deletion needs the child's *href* reportable via
 * `sync-collection` after the actual `CalendarObject` row is gone, and an
 * id alone can't build one. No live foreign key to `calendar_objects`,
 * same reasoning as `CollectionChange.name`: it must survive the child's
 * own deletion.
 *
 * Never updated or read individually — only ever inserted, and later
 * queried as "every change on this calendar with `seq` greater than the
 * client's last-known sync token".
 */
@Entity('calendar_changes')
@Index(['calendarId', 'seq'], { unique: true })
export class CalendarChange {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the calendar this change happened in (the parent, not the changed child). */
  @Column({ type: 'uuid' })
  calendarId!: string;

  /** The calendar this change happened in. */
  @ManyToOne(() => CalendarCollection)
  @JoinColumn({ name: 'calendar_id' })
  calendar!: CalendarCollection;

  /**
   * The parent calendar's `syncSeq` value after this change was applied —
   * monotonically increasing per `calendarId`.
   */
  @Column({ type: 'int' })
  seq!: number;

  /** The changed child's own path segment (`CalendarObject.name`), denormalized. */
  @Column({ type: 'varchar' })
  name!: string;

  /** What happened to the child. */
  @Column({ type: 'simple-enum', enum: COLLECTION_CHANGE_ACTIONS })
  action!: CollectionChangeAction;

  /** Timestamp this change was recorded. */
  @CreateDateColumn()
  createdAt!: Date;
}
