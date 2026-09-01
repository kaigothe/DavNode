import type { LockScope } from '../../entities/collection-lock.entity.js';
import type { EffectiveLock } from './collect-locks.js';

/**
 * Whether a new lock request for `requestedScope` would conflict with
 * any of `existingLocks` (RFC 4918 §6.1). An `exclusive` request
 * conflicts with any existing effective lock, `exclusive` or `shared`;
 * a `shared` request only conflicts with an existing `exclusive` lock —
 * any number of `shared` locks can coexist.
 *
 * @param existingLocks - The resource's currently-effective locks (see
 * {@link getEffectiveLocks}).
 * @param requestedScope - The scope of the lock being requested.
 * @returns Whether granting the request would conflict.
 */
export function wouldConflict(
  existingLocks: readonly EffectiveLock[],
  requestedScope: LockScope,
): boolean {
  if (requestedScope === 'exclusive') {
    return existingLocks.length > 0;
  }
  return existingLocks.some((lock) => lock.scope === 'exclusive');
}
