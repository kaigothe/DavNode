import type { LockScope } from '../../entities/collection-lock.entity.js';
import type { EffectiveLock, LockLike } from './collect-locks.js';

/**
 * Whether a new lock request for `requestedScope` would conflict with
 * any of `existingLocks` (RFC 4918 §6.1). An `exclusive` request
 * conflicts with any existing effective lock, `exclusive` or `shared`;
 * a `shared` request only conflicts with an existing `exclusive` lock —
 * any number of `shared` locks can coexist.
 *
 * Generic over any domain's lock row (`LockLike`, the loosest bound) —
 * only `scope` matters here, so this works unchanged for
 * `getEffectiveWebDavLocks` and `getEffectiveAddressbookLocks` alike.
 *
 * @param existingLocks - The resource's currently-effective locks (see
 * {@link getEffectiveLocks}).
 * @param requestedScope - The scope of the lock being requested.
 * @returns Whether granting the request would conflict.
 */
export function wouldConflict(
  existingLocks: readonly EffectiveLock<LockLike>[],
  requestedScope: LockScope,
): boolean {
  if (requestedScope === 'exclusive') {
    return existingLocks.length > 0;
  }
  return existingLocks.some((lock) => lock.scope === 'exclusive');
}
