import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AddressbookCollection } from './addressbook-collection.entity.js';
import {
  COLLECTION_CHANGE_ACTIONS,
  type CollectionChangeAction,
} from './collection-change.entity.js';

/**
 * A change-log entry for one of an {@link AddressbookCollection}'s
 * direct children (an `AddressObject`) — added, modified, or deleted.
 * Mirrors `CollectionChange` (M4) for the addressbook domain, reusing
 * its {@link CollectionChangeAction} vocabulary (plain value vocabulary,
 * not domain-specific data).
 *
 * `name` denormalizes the changed `AddressObject`'s own path segment
 * (`AddressObject.name`, added by Große Aufgabe 4's AddressObject-CRUD
 * sub-task — this class predates it and originally denormalized
 * `addressObjectId` instead, back when `AddressObject` had no separate
 * name of its own to denormalize), exactly like `CollectionChange.name`
 * does for the WebDAV domain: a deletion needs the child's *href*
 * reportable via `sync-collection` after the actual `AddressObject` row
 * is gone, and an id alone can't build one — a subsequent lookup by id
 * is impossible once the row is deleted, whereas the name was captured
 * here at write time. No live foreign key to `address_objects`, same
 * reasoning as `CollectionChange.name`: it must survive the child's own
 * deletion.
 *
 * Never updated or read individually — only ever inserted, and later
 * queried as "every change on this addressbook with `seq` greater than
 * the client's last-known sync token" (see the sync-collection-for-
 * addressbooks retrofit, milestones/M5-carddav/05-acl-lock-sync-reuse).
 */
@Entity('addressbook_changes')
@Index(['addressbookId', 'seq'], { unique: true })
export class AddressbookChange {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the addressbook this change happened in (the parent, not the changed child). */
  @Column({ type: 'uuid' })
  addressbookId!: string;

  /** The addressbook this change happened in. */
  @ManyToOne(() => AddressbookCollection)
  @JoinColumn({ name: 'addressbook_id' })
  addressbook!: AddressbookCollection;

  /**
   * The parent addressbook's `syncSeq` value after this change was
   * applied — monotonically increasing per `addressbookId`.
   */
  @Column({ type: 'int' })
  seq!: number;

  /** The changed child's own path segment (`AddressObject.name`), denormalized. */
  @Column({ type: 'varchar' })
  name!: string;

  /** What happened to the child. */
  @Column({ type: 'simple-enum', enum: COLLECTION_CHANGE_ACTIONS })
  action!: CollectionChangeAction;

  /** Timestamp this change was recorded. */
  @CreateDateColumn()
  createdAt!: Date;
}
