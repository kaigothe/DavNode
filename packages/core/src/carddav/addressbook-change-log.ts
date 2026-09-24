import { MoreThan, type EntityManager } from 'typeorm';
import { AddressbookChange } from '../entities/addressbook-change.entity.js';
import type {
  ChangeEntry,
  ChangeLogRepository,
} from '../webdav/sync/change-log.js';

/**
 * The addressbook domain's {@link ChangeLogRepository}, backed by
 * `addressbook_changes` — the counterpart of `CollectionChangeLog`, so
 * the shared `sync-collection` handler reads an addressbook's change log
 * without knowing which table it lives in.
 */
export class AddressbookChangeLog implements ChangeLogRepository {
  /** See {@link ChangeLogRepository.loadChangesSince}. */
  async loadChangesSince(
    manager: EntityManager,
    collectionId: string,
    seq: number,
  ): Promise<ChangeEntry[]> {
    const changes = await manager.getRepository(AddressbookChange).find({
      where: { addressbookId: collectionId, seq: MoreThan(seq) },
      order: { seq: 'ASC' },
    });
    return changes.map(({ name, action, seq: changeSeq }) => ({
      name,
      action,
      seq: changeSeq,
    }));
  }
}
