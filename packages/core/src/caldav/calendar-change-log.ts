import { MoreThan, type EntityManager } from 'typeorm';
import { CalendarChange } from '../entities/calendar-change.entity.js';
import type {
  ChangeEntry,
  ChangeLogRepository,
} from '../webdav/sync/change-log.js';

/**
 * The calendar domain's {@link ChangeLogRepository}, backed by
 * `calendar_changes` — the counterpart of `CollectionChangeLog` and
 * `AddressbookChangeLog`, so the shared `sync-collection` handler reads a
 * calendar's change log without knowing which table it lives in.
 */
export class CalendarChangeLog implements ChangeLogRepository {
  /** See {@link ChangeLogRepository.loadChangesSince}. */
  async loadChangesSince(
    manager: EntityManager,
    collectionId: string,
    seq: number,
  ): Promise<ChangeEntry[]> {
    const changes = await manager.getRepository(CalendarChange).find({
      where: { calendarId: collectionId, seq: MoreThan(seq) },
      order: { seq: 'ASC' },
    });
    return changes.map(({ name, action, seq: changeSeq }) => ({
      name,
      action,
      seq: changeSeq,
    }));
  }
}
