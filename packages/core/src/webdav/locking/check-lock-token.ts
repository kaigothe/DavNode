import type { EffectiveLock } from './collect-locks.js';

/**
 * Whether `ifHeaderTokens` covers every one of `effectiveLocks` — i.e.
 * whether a request carrying these tokens (from the `If` header, RFC
 * 4918 §10.4) is entitled to bypass every lock currently in effect on
 * the resource. Used by the lock-enforcement middleware ahead of every
 * mutating method (see
 * milestones/M4-locking-sync/05-lock-enforcement-middleware). A resource
 * with no effective locks is trivially satisfied, even by an empty
 * token set.
 *
 * @param effectiveLocks - The resource's currently-effective locks (see
 * {@link getEffectiveLocks}).
 * @param ifHeaderTokens - Lock tokens submitted in the request's `If`
 * header.
 * @returns Whether every effective lock is covered by a submitted token.
 */
export function hasValidLockToken(
  effectiveLocks: readonly EffectiveLock[],
  ifHeaderTokens: ReadonlySet<string>,
): boolean {
  return effectiveLocks.every((lock) => ifHeaderTokens.has(lock.token));
}
