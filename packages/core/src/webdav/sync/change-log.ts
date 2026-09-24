import type { EntityManager } from 'typeorm';
import { MoreThan } from 'typeorm';
import {
  CollectionChange,
  type CollectionChangeAction,
} from '../../entities/collection-change.entity.js';

/**
 * One entry of a collection's change log, as `sync-collection` needs it:
 * which child changed, and how. Deliberately the common denominator of
 * every domain's change-log row (`CollectionChange`,
 * `AddressbookChange`) — the report never looks at anything else, so
 * a domain's own extra columns stay out of the shared handler.
 */
export interface ChangeEntry {
  /** The changed child's own path segment. */
  name: string;
  /** What happened to it. */
  action: CollectionChangeAction;
  /** The parent collection's `syncSeq` right after this change. */
  seq: number;
}

/**
 * Reads one domain's change log (`collection_changes`,
 * `addressbook_changes`, ...) on behalf of the `sync-collection` REPORT
 * handler, so the handler itself never names a specific change-log
 * table (RFC 6578; `milestones/M5-carddav/05-acl-lock-sync-reuse/03-sync-collection-for-addressbooks.md`).
 */
export interface ChangeLogRepository {
  /**
   * Loads every change recorded on `collectionId` with a `seq` strictly
   * greater than `seq`, ordered by `seq` ascending.
   *
   * @param manager - The `EntityManager` to query with.
   * @param collectionId - The parent collection (or addressbook) whose
   * change log to read.
   * @param seq - The client's last-known sync sequence; only later
   * changes are returned.
   */
  loadChangesSince(
    manager: EntityManager,
    collectionId: string,
    seq: number,
  ): Promise<ChangeEntry[]>;
}

/** The WebDAV domain's {@link ChangeLogRepository}, backed by `collection_changes`. */
export class CollectionChangeLog implements ChangeLogRepository {
  /** See {@link ChangeLogRepository.loadChangesSince}. */
  async loadChangesSince(
    manager: EntityManager,
    collectionId: string,
    seq: number,
  ): Promise<ChangeEntry[]> {
    const changes = await manager.getRepository(CollectionChange).find({
      where: { collectionId, seq: MoreThan(seq) },
      order: { seq: 'ASC' },
    });
    return changes.map(({ name, action, seq: changeSeq }) => ({
      name,
      action,
      seq: changeSeq,
    }));
  }
}
