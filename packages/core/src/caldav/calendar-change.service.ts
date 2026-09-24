import type { EntityManager } from 'typeorm';
import { CalendarChange } from '../entities/calendar-change.entity.js';
import { CalendarCollection } from '../entities/calendar-collection.entity.js';
import type { CollectionChangeAction } from '../entities/collection-change.entity.js';

/**
 * Records a mutating CalendarObject-CRUD operation's effect on one of a
 * calendar's direct children, and bumps that calendar's `syncSeq` — the
 * calendar domain's counterpart to `AddressbookChangeService` (M5) and
 * `CollectionChangeService` (M2/M4). The entries it writes are what
 * `CalendarChangeLog` hands the `sync-collection` REPORT.
 *
 * Takes an `EntityManager` rather than owning its own transaction: a
 * change record must commit or roll back together with the mutation it
 * describes. `syncSeq` is bumped with `increment()` (one atomic
 * `UPDATE ... SET sync_seq = sync_seq + 1`), so two concurrent changes to
 * the same calendar can't lose an update.
 */
export class CalendarChangeService {
  /**
   * Records one change and bumps the parent calendar's `syncSeq`.
   *
   * @param manager - The same `EntityManager` the caller's own mutation
   * is using, so both commit or roll back together.
   * @param calendarId - The calendar whose direct child changed (not the
   * child itself).
   * @param childName - The changed child's own path segment
   * (`CalendarObject.name`), denormalized onto the change record so a
   * deletion can still be reported once the child's row is gone.
   * @param action - What happened to the child.
   */
  async recordChange(
    manager: EntityManager,
    calendarId: string,
    childName: string,
    action: CollectionChangeAction,
  ): Promise<void> {
    await manager
      .getRepository(CalendarCollection)
      .increment({ id: calendarId }, 'syncSeq', 1);
    const parent = await manager
      .getRepository(CalendarCollection)
      .findOneByOrFail({ id: calendarId });

    const changes = manager.getRepository(CalendarChange);
    await changes.save(
      changes.create({
        calendarId,
        seq: parent.syncSeq,
        name: childName,
        action,
      }),
    );
  }
}
