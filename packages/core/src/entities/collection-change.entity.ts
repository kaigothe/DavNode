import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Collection } from './collection.entity.js';

/**
 * What happened to a {@link Collection}'s direct child, recorded by a
 * {@link CollectionChange} row.
 */
export type CollectionChangeAction = 'added' | 'modified' | 'deleted';

/** All valid {@link CollectionChangeAction} values. */
export const COLLECTION_CHANGE_ACTIONS: readonly CollectionChangeAction[] = [
  'added',
  'modified',
  'deleted',
];

/**
 * A change-log entry for one of a {@link Collection}'s direct children
 * (a sub-collection or `FileResource`) — added, modified, or deleted.
 * Written by every mutating WebDAV operation
 * (`milestones/M2-webdav-core/06-resource-crud`) as groundwork for the
 * `sync-collection` REPORT (M4): `seq` mirrors the parent collection's
 * `syncSeq` at the moment of the change, and `name` denormalizes the
 * child's own path segment so a deletion can still be reported after
 * the child's own row is gone.
 *
 * Never updated or read individually — only ever inserted, and later
 * (M4) queried as "every change on this collection with `seq` greater
 * than the client's last-known sync token."
 */
@Entity('collection_changes')
@Index(['collectionId', 'seq'], { unique: true })
export class CollectionChange {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the collection this change happened in (the parent, not the changed child). */
  @Column({ type: 'uuid' })
  collectionId!: string;

  /** The collection this change happened in. */
  @ManyToOne(() => Collection)
  @JoinColumn({ name: 'collection_id' })
  collection!: Collection;

  /**
   * The parent collection's `syncSeq` value after this change was
   * applied — monotonically increasing per `collectionId`.
   */
  @Column({ type: 'int' })
  seq!: number;

  /** The changed child's own path segment (`displayName`/`name`), denormalized. */
  @Column({ type: 'varchar' })
  name!: string;

  /** What happened to the child. */
  @Column({ type: 'simple-enum', enum: COLLECTION_CHANGE_ACTIONS })
  action!: CollectionChangeAction;

  /** Timestamp this change was recorded. */
  @CreateDateColumn()
  createdAt!: Date;
}
