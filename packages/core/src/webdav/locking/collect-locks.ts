import type { EntityManager } from 'typeorm';
import { CollectionLock } from '../../entities/collection-lock.entity.js';
import { Collection } from '../../entities/collection.entity.js';
import { FileLock } from '../../entities/file-lock.entity.js';
import type { WebDavTreeResource } from '../resource-path-resolver.js';

/**
 * One lock as returned by {@link getEffectiveLocks}: the stored row
 * (`CollectionLock` for a direct lock on a `Collection` or one inherited
 * from an ancestor collection; `FileLock` for a direct lock on a
 * `FileResource`), plus where it came from.
 */
export type EffectiveLock = (CollectionLock | FileLock) & {
  /**
   * `false` for a direct lock on the resource itself, `true` for one
   * inherited from an ancestor collection.
   */
  inherited: boolean;
  /**
   * The ancestor collection this lock was inherited from, or `null` for
   * a direct (non-inherited) lock.
   */
  inheritedFrom: string | null;
};

/** Whether `lock` is still in effect — not expired (lazy expiry, RFC 4918 §7). */
function isActive(lock: { expiresAt: Date | null }): boolean {
  return lock.expiresAt === null || lock.expiresAt.getTime() >= Date.now();
}

/**
 * Finds every lock (RFC 4918 §7–9) currently in effect for `resource`:
 * its own direct lock(s), plus every ancestor collection's lock(s) whose
 * `depth` is `'infinity'` — the same walk-to-root traversal
 * `collectWebDavAces` (M3) uses for ACE inheritance, except a lock only
 * propagates down when its owning collection opted into
 * `Depth: infinity`, unlike an ACE, which always inherits (see
 * milestones/M4-locking-sync/00-setting-goal.md).
 *
 * Expired locks (`expiresAt` in the past) are silently excluded —
 * lazily, with no separate cleanup job; an expired row is simply inert.
 *
 * Concrete to the WebDAV domain (`collection_locks`/`file_locks`) rather
 * than generic over a lock table type, unlike `collectAces` — deferred
 * until M5 needs the same traversal for `addressbook_locks`/
 * `address_object_locks` (see
 * milestones/M4-locking-sync/02-lock-evaluation/00-overview.md).
 *
 * @param manager - The `EntityManager` to query with.
 * @param resource - The resource to find effective locks for.
 * @returns Every currently-effective lock, direct locks first.
 */
export async function getEffectiveLocks(
  manager: EntityManager,
  resource: WebDavTreeResource,
): Promise<EffectiveLock[]> {
  const direct =
    resource instanceof Collection
      ? await manager
          .getRepository(CollectionLock)
          .findBy({ collectionId: resource.id })
      : await manager
          .getRepository(FileLock)
          .findBy({ fileResourceId: resource.id });

  const effective: EffectiveLock[] = direct
    .filter(isActive)
    .map((lock) => ({ ...lock, inherited: false, inheritedFrom: null }));

  let currentCollectionId =
    resource instanceof Collection
      ? resource.parentCollectionId
      : resource.collectionId;
  const visitedCollectionIds = new Set<string>();

  while (
    currentCollectionId !== null &&
    !visitedCollectionIds.has(currentCollectionId)
  ) {
    visitedCollectionIds.add(currentCollectionId);

    const ancestorLocks = await manager
      .getRepository(CollectionLock)
      .findBy({ collectionId: currentCollectionId, depth: 'infinity' });
    for (const lock of ancestorLocks) {
      if (isActive(lock)) {
        effective.push({
          ...lock,
          inherited: true,
          inheritedFrom: currentCollectionId,
        });
      }
    }

    const collection = await manager
      .getRepository(Collection)
      .findOneByOrFail({ id: currentCollectionId });
    currentCollectionId = collection.parentCollectionId;
  }

  return effective;
}
