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
 * `addressObjectId` is a **denormalized** reference, not a live foreign
 * key: unlike `CollectionChange.name` (a plain string that survives its
 * child's deletion because it was never tied to the child row),
 * `AddressObject` has no separate client-chosen "name" distinct from its
 * own `id` — the id itself is what a deletion needs to still be
 * reportable via `sync-collection` after the actual `AddressObject` row
 * is gone. A real FK constraint here would defeat that: cascading
 * deletes would erase the very change row meant to report the deletion,
 * and this codebase's default (`NO ACTION`) would instead block the
 * `AddressObject` delete outright. So this column is plain `uuid` data,
 * deliberately outside the `address_objects` foreign-key graph — the
 * same trade-off `CollectionChange.name` makes, just backed
 * by an id instead of a string.
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

  /**
   * Id of the changed `AddressObject`, denormalized (no live foreign
   * key — see the class-level note). Nullable for parity with other
   * domains' change-log shape, though every row written by this
   * domain's CRUD/DELETE handlers always sets it: an addressbook change
   * is always about exactly one child.
   */
  @Column({ type: 'uuid', nullable: true })
  addressObjectId!: string | null;

  /** What happened to the child. */
  @Column({ type: 'simple-enum', enum: COLLECTION_CHANGE_ACTIONS })
  action!: CollectionChangeAction;

  /** Timestamp this change was recorded. */
  @CreateDateColumn()
  createdAt!: Date;
}
