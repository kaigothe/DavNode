import { create } from 'xmlbuilder2';
import { DAV_NAMESPACE } from '../xml/request-parser.js';
import { embedRawXmlContent } from '../xml/xml-value.js';
import type { EffectiveLock } from './collect-locks.js';

const DAV_PREFIX = 'D';

/**
 * The `<D:depth>` value (RFC 4918 §14.7) for `lock`: its own `depth`
 * field for a `CollectionLock` (mapping the stored `'zero'`/`'infinity'`
 * enum to the XML element's literal `'0'`/`'infinity'` values), or
 * always `'0'` for a `FileLock` — a single file has no members for the
 * lock to cover beyond itself.
 */
function activeLockDepth(lock: EffectiveLock): string {
  if ('depth' in lock) {
    return lock.depth === 'infinity' ? 'infinity' : '0';
  }
  return '0';
}

/**
 * The `<D:timeout>` value (RFC 4918 §14.28) for `lock`: `'Infinite'` for
 * a `null` `expiresAt`, otherwise `Second-N` for the whole seconds
 * remaining until it expires. Recomputed from `expiresAt` on every call
 * rather than read back from `timeoutSeconds` — `timeoutSeconds` is the
 * originally-granted duration, not the remaining one. Never negative:
 * `getEffectiveLocks` already excludes expired locks, so `lock` is
 * always still active here.
 */
function activeLockTimeout(lock: EffectiveLock): string {
  if (lock.expiresAt === null) {
    return 'Infinite';
  }
  const remainingSeconds = Math.round(
    (lock.expiresAt.getTime() - Date.now()) / 1000,
  );
  return `Second-${Math.max(0, remainingSeconds)}`;
}

/**
 * Builds one `<D:activelock>` fragment (RFC 4918 §14.1) describing
 * `lock`, rooted at `lockRootHref` — the `<D:href>` of the resource the
 * lock actually sits on (RFC 4918 §14.12's `lockroot`), which for an
 * inherited lock is an ancestor collection, not necessarily the resource
 * whose effective locks are being reported.
 *
 * `<D:owner>` is only included when `lock.ownerInfo` is non-`null` (the
 * client omitted `<D:owner>` from its `<D:lockinfo>`, RFC 4918 §14.17
 * makes it optional); when present, `ownerInfo`'s raw content is
 * re-embedded exactly as `lock-request-parser.ts` captured it — the
 * server must preserve it unaltered.
 */
export function buildActiveLockXml(
  lock: EffectiveLock,
  lockRootHref: string,
): string {
  const activelock = create().ele(DAV_NAMESPACE, `${DAV_PREFIX}:activelock`);

  activelock
    .ele(DAV_NAMESPACE, `${DAV_PREFIX}:lockscope`)
    .ele(DAV_NAMESPACE, `${DAV_PREFIX}:${lock.scope}`);
  activelock
    .ele(DAV_NAMESPACE, `${DAV_PREFIX}:locktype`)
    .ele(DAV_NAMESPACE, `${DAV_PREFIX}:write`);
  activelock
    .ele(DAV_NAMESPACE, `${DAV_PREFIX}:depth`)
    .txt(activeLockDepth(lock));

  if (lock.ownerInfo !== null) {
    const owner = activelock.ele(DAV_NAMESPACE, `${DAV_PREFIX}:owner`);
    embedRawXmlContent(owner, lock.ownerInfo);
  }

  activelock
    .ele(DAV_NAMESPACE, `${DAV_PREFIX}:timeout`)
    .txt(activeLockTimeout(lock));
  activelock
    .ele(DAV_NAMESPACE, `${DAV_PREFIX}:locktoken`)
    .ele(DAV_NAMESPACE, `${DAV_PREFIX}:href`)
    .txt(lock.token);
  activelock
    .ele(DAV_NAMESPACE, `${DAV_PREFIX}:lockroot`)
    .ele(DAV_NAMESPACE, `${DAV_PREFIX}:href`)
    .txt(lockRootHref);

  return activelock.toString();
}

/** One {@link EffectiveLock}, paired with its already-resolved `lockroot` href. */
export interface RootedLock {
  lock: EffectiveLock;
  lockRootHref: string;
}

/**
 * Builds the full `<D:lockdiscovery>` content (RFC 4918 §15.8) for a set
 * of locks: one `<D:activelock>` fragment per entry, in order —
 * `DAV:lockdiscovery`'s own element is created by the caller (the LOCK
 * response body, or the PROPFIND live-property machinery embedding this
 * as a `PropertyValue.value`), not by this function.
 *
 * Resolving each lock's `lockRootHref` (trivial for a direct lock — the
 * queried resource's own href — but requiring an ancestor-collection
 * lookup for an inherited one) is the caller's job; see `lock.route.ts`
 * for lock creation's single-lock case and the (M4 task 6)
 * `lock-properties-provider.ts` for the general, potentially-inherited
 * case PROPFIND needs.
 */
export function buildLockDiscoveryContent(
  locks: readonly RootedLock[],
): string {
  return locks
    .map(({ lock, lockRootHref }) => buildActiveLockXml(lock, lockRootHref))
    .join('');
}
