import type { EntityManager } from 'typeorm';
import {
  CollectionChange,
  type CollectionChangeAction,
} from '../entities/collection-change.entity.js';
import { Collection } from '../entities/collection.entity.js';

/**
 * Records a mutating WebDAV operation's effect on one of a collection's
 * direct children, and bumps that collection's `syncSeq` — groundwork
 * for the `sync-collection` REPORT (M4), written by every mutating
 * operation in `milestones/M2-webdav-core/06-resource-crud` so it
 * doesn't need to be retrofitted into each handler later.
 *
 * Takes an `EntityManager` rather than owning its own transaction: a
 * change record must commit or roll back together with the mutation it
 * describes (e.g. MKCOL's new `Collection` row), so the caller's
 * transaction is the one that matters here.
 *
 * `Collection.syncSeq` is bumped via `increment()` (a single atomic
 * `UPDATE ... SET sync_seq = sync_seq + 1`, portable across
 * SQLite/Postgres/MySQL) rather than a read-modify-write in application
 * code, so two concurrent changes to the same collection can't lose an
 * update — the row lock that statement holds until the transaction
 * commits is what makes the later read of the new value safe.
 */
export class CollectionChangeService {
  /**
   * Records one change and bumps the parent collection's `syncSeq`.
   *
   * @param manager - The same `EntityManager` the caller's own mutation
   * is using, so both commit or roll back together.
   * @param parentCollectionId - The collection whose direct child
   * changed (not the child itself).
   * @param childName - The changed child's own path segment
   * (`Collection.displayName` or `FileResource.name`), denormalized
   * onto the change record so a deletion can still be reported once
   * the child's own row is gone.
   */
  async recordChange(
    manager: EntityManager,
    parentCollectionId: string,
    childName: string,
    action: CollectionChangeAction,
  ): Promise<void> {
    await manager
      .getRepository(Collection)
      .increment({ id: parentCollectionId }, 'syncSeq', 1);
    const parent = await manager
      .getRepository(Collection)
      .findOneByOrFail({ id: parentCollectionId });

    const changes = manager.getRepository(CollectionChange);
    await changes.save(
      changes.create({
        collectionId: parentCollectionId,
        seq: parent.syncSeq,
        name: childName,
        action,
      }),
    );
  }
}
