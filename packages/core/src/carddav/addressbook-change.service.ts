import type { EntityManager } from 'typeorm';
import { AddressbookChange } from '../entities/addressbook-change.entity.js';
import { AddressbookCollection } from '../entities/addressbook-collection.entity.js';
import type { CollectionChangeAction } from '../entities/collection-change.entity.js';

/**
 * Records a mutating AddressObject-CRUD operation's effect on one of an
 * addressbook's direct children, and bumps that addressbook's
 * `syncSeq` — the CardDAV domain's counterpart to `CollectionChangeService`
 * (M2/M4), groundwork for the future `sync-collection` REPORT on
 * addressbooks (see milestones/M5-carddav/05-acl-lock-sync-reuse's
 * sync-collection-for-addressbooks sub-task).
 *
 * Takes an `EntityManager` rather than owning its own transaction, for
 * the same reason `CollectionChangeService` does: a change record must
 * commit or roll back together with the mutation it describes.
 *
 * `AddressbookCollection.syncSeq` is bumped via `increment()` (a single
 * atomic `UPDATE ... SET sync_seq = sync_seq + 1`), not a
 * read-modify-write, so two concurrent changes to the same addressbook
 * can't lose an update.
 */
export class AddressbookChangeService {
  /**
   * Records one change and bumps the parent addressbook's `syncSeq`.
   *
   * @param manager - The same `EntityManager` the caller's own mutation
   * is using, so both commit or roll back together.
   * @param addressbookId - The addressbook whose direct child changed
   * (not the child itself).
   * @param childName - The changed child's own path segment
   * (`AddressObject.name`), denormalized onto the change record so a
   * deletion can still be reported once the child's own row is gone.
   * @param action - What happened to the child.
   */
  async recordChange(
    manager: EntityManager,
    addressbookId: string,
    childName: string,
    action: CollectionChangeAction,
  ): Promise<void> {
    await manager
      .getRepository(AddressbookCollection)
      .increment({ id: addressbookId }, 'syncSeq', 1);
    const parent = await manager
      .getRepository(AddressbookCollection)
      .findOneByOrFail({ id: addressbookId });

    const changes = manager.getRepository(AddressbookChange);
    await changes.save(
      changes.create({
        addressbookId,
        seq: parent.syncSeq,
        name: childName,
        action,
      }),
    );
  }
}
