import type { EntityManager } from 'typeorm';
import { Tenant } from '../entities/tenant.entity.js';
import { User } from '../entities/user.entity.js';

/** Which level's quota {@link QuotaExceededError} was raised for. */
export type QuotaLevel = 'user' | 'tenant';

/**
 * Thrown by {@link applyQuotaDelta} when applying its `deltaBytes` would
 * push `level`'s `quota_used_bytes` past its own `quota_limit_bytes`. No
 * counter was changed by the call that threw this — the underlying
 * conditional `UPDATE` affected zero rows precisely because the limit
 * would have been exceeded (see {@link applyQuotaDelta}) — but the
 * *other* level's `UPDATE` may already have run inside the same
 * transaction, so the caller must roll the whole transaction back (never
 * commit) before answering `507 Insufficient Storage`.
 */
export class QuotaExceededError extends Error {
  /** @param level - Which quota level (`user` or `tenant`) the write would have exceeded. */
  constructor(readonly level: QuotaLevel) {
    super(`The ${level} storage quota would be exceeded by this write.`);
    this.name = 'QuotaExceededError';
  }
}

/** {@link applyQuotaDelta}'s input. */
export interface ApplyQuotaDeltaInput {
  /** The user whose `quota_used_bytes` to adjust. */
  userId: string;
  /** The tenant whose `quota_used_bytes` to adjust. */
  tenantId: string;
  /** Bytes to add (a write) or remove (a delete/shrink, negative) from both counters. */
  deltaBytes: number;
}

/**
 * Atomically adjusts `quota_used_bytes` on both the `User` and `Tenant`
 * rows, enforcing each one's own `quota_limit_bytes` — within `manager`'s
 * own, already-open transaction, never one of its own (planning/
 * 05-data-model.md, "Quota"; race rationale in
 * milestones/M8-quota/00-setting-goal.md). Every write/delete of actual
 * resource content (`FileContent`/`CalendarObjectContent`/
 * `AddressObjectContent`) calls this in the same transaction as the
 * content change itself.
 *
 * Each level is a single conditional `UPDATE`:
 * ```
 * UPDATE users SET quota_used_bytes = GREATEST(quota_used_bytes + :delta, 0)
 * WHERE id = :userId
 *   AND (quota_limit_bytes IS NULL OR quota_used_bytes + :delta <= quota_limit_bytes)
 * ```
 * (analogously for `tenants`) — so the read-then-check-then-write race a
 * naive implementation would have is impossible: the database evaluates
 * the guard atomically with the write itself, under the row's own lock.
 * Two concurrent calls that would together exceed the limit, but not
 * individually, can therefore never both succeed — whichever `UPDATE`
 * commits first serializes the second behind it, and by the time the
 * second runs, `quota_used_bytes` already reflects the first's delta.
 *
 * The `WHERE` guard only ever blocks a delta that would push the counter
 * *above* the limit, so a negative `deltaBytes` (a delete or shrink) is
 * never blocked by it. The stored value is still floored at `0`
 * (`GREATEST`/`MAX`, cross-driver — SQLite has no `GREATEST`) as a
 * separate safeguard against counter drift compounding negative over
 * time; this floor never affects the guard itself, which always compares
 * against the unclamped `quota_used_bytes + :delta`.
 *
 * `quota_limit_bytes IS NULL` means "no limit": the guard's first
 * disjunct is then always true, so the `UPDATE` always goes through
 * regardless of `deltaBytes`.
 *
 * @throws {@link QuotaExceededError} if either `UPDATE` affects zero rows
 * (the User's own counter is checked, and its `UPDATE` executed, first;
 * the Tenant's second) — the caller's transaction rollback undoes any
 * change the User `UPDATE` already made if the Tenant's is what fails.
 */
export async function applyQuotaDelta(
  manager: EntityManager,
  input: ApplyQuotaDeltaInput,
): Promise<void> {
  const { userId, tenantId, deltaBytes } = input;
  const clamp =
    manager.connection.options.type === 'better-sqlite3'
      ? 'MAX(quota_used_bytes + :delta, 0)'
      : 'GREATEST(quota_used_bytes + :delta, 0)';

  const userResult = await manager
    .createQueryBuilder()
    .update(User)
    .set({ quotaUsedBytes: () => clamp })
    .where(
      'id = :userId AND (quota_limit_bytes IS NULL OR quota_used_bytes + :delta <= quota_limit_bytes)',
      { userId, delta: deltaBytes },
    )
    .execute();
  if (!userResult.affected) {
    throw new QuotaExceededError('user');
  }

  const tenantResult = await manager
    .createQueryBuilder()
    .update(Tenant)
    .set({ quotaUsedBytes: () => clamp })
    .where(
      'id = :tenantId AND (quota_limit_bytes IS NULL OR quota_used_bytes + :delta <= quota_limit_bytes)',
      { tenantId, delta: deltaBytes },
    )
    .execute();
  if (!tenantResult.affected) {
    throw new QuotaExceededError('tenant');
  }
}
