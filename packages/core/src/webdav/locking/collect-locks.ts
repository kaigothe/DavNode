import type { EntityManager } from 'typeorm';
import { AddressbookLock } from '../../entities/addressbook-lock.entity.js';
import { AddressbookCollection } from '../../entities/addressbook-collection.entity.js';
import { AddressObjectLock } from '../../entities/address-object-lock.entity.js';
import {
  type LockDepth,
  type LockScope,
  CollectionLock,
} from '../../entities/collection-lock.entity.js';
import { Collection } from '../../entities/collection.entity.js';
import { FileLock } from '../../entities/file-lock.entity.js';
import type { AddressbookAclResource } from '../../carddav/addressbook-acl-resource.js';
import type { WebDavTreeResource } from '../resource-path-resolver.js';

/**
 * The shape every domain's lock row shares (see `CollectionLock`/
 * `FileLock` and their addressbook counterparts, M5) — everything
 * {@link getEffectiveLocks}, {@link wouldConflict}, and
 * {@link hasValidLockToken} need, independent of which specific foreign
 * key column ties a row to its resource. Mirrors `AceLike`
 * (`acl/collect-aces.ts`).
 *
 * `depth` is optional: only a collection-level lock (`CollectionLock`/
 * `AddressbookLock`) has one at all — an object-level lock
 * (`FileLock`/`AddressObjectLock`) has no descendants for a lock to
 * cascade to, so it structurally satisfies this field by omitting it,
 * the same way `activeLockDepth` (`lock-discovery.ts`) already treated
 * a missing `depth` as `'0'` before this type existed.
 */
export interface LockLike {
  id: string;
  principalId: string;
  token: string;
  scope: LockScope;
  depth?: LockDepth;
  timeoutSeconds: number | null;
  expiresAt: Date | null;
  ownerInfo: string | null;
}

/**
 * One lock as returned by {@link getEffectiveLocks}: the stored row,
 * plus where it came from.
 */
export type EffectiveLock<TLock extends LockLike> = TLock & {
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
 * Finds every lock (RFC 4918 §7–9) currently in effect for a resource,
 * given its own direct locks and a way to walk up its ancestor chain:
 * the resource's own direct lock(s), plus every ancestor collection's
 * `Depth: infinity` lock(s) — the same walk-to-root traversal
 * {@link collectAces} (M3) uses for ACE inheritance, except a lock only
 * propagates down when its owning collection opted into
 * `Depth: infinity`, unlike an ACE, which always inherits (see
 * milestones/M4-locking-sync/00-setting-goal.md). That `depth`
 * filtering is `findAncestorLocks`'s own responsibility — the same
 * division of labor `collectAces`'s `findCollectionAces` callback has —
 * so this function itself stays domain-agnostic.
 *
 * Expired locks (`expiresAt` in the past) are silently excluded —
 * lazily, with no separate cleanup job; an expired row is simply inert.
 *
 * Generic over both the resource's own lock row type (`TLock`) and the
 * lock row type of the collections it inherits from (`TCollectionLock`)
 * — for `Collection`/`FileResource` both resolve to `CollectionLock`
 * (see {@link getEffectiveWebDavLocks}), and M5/M6 call this same
 * function with their own lock entities instead of reimplementing the
 * traversal.
 *
 * @param ownLocks - The resource's own direct locks, unfiltered by
 * expiry.
 * @param startCollectionId - The collection inheritance starts from:
 * the resource's own parent collection if it's itself a collection, or
 * its containing collection if it's a leaf object. `null` if the
 * resource has no ancestor to inherit from.
 * @param findAncestorLocks - Fetches one collection's own
 * `Depth: infinity` locks (already filtered to that depth by the caller).
 * @param findParentCollectionId - Fetches a collection's parent id, or
 * `null` if it has none (the walk's termination case).
 * @returns Every currently-effective lock, direct locks first.
 */
export async function getEffectiveLocks<
  TLock extends LockLike,
  TCollectionLock extends LockLike,
>(
  ownLocks: readonly TLock[],
  startCollectionId: string | null,
  findAncestorLocks: (collectionId: string) => Promise<TCollectionLock[]>,
  findParentCollectionId: (collectionId: string) => Promise<string | null>,
): Promise<EffectiveLock<TLock | TCollectionLock>[]> {
  const direct: EffectiveLock<TLock>[] = ownLocks
    .filter(isActive)
    .map((lock) => ({ ...lock, inherited: false, inheritedFrom: null }));

  const inherited: EffectiveLock<TCollectionLock>[] = [];
  const visitedCollectionIds = new Set<string>();
  let currentCollectionId = startCollectionId;

  while (
    currentCollectionId !== null &&
    !visitedCollectionIds.has(currentCollectionId)
  ) {
    visitedCollectionIds.add(currentCollectionId);

    const ancestorLocks = await findAncestorLocks(currentCollectionId);
    for (const lock of ancestorLocks) {
      if (isActive(lock)) {
        inherited.push({
          ...lock,
          inherited: true,
          inheritedFrom: currentCollectionId,
        });
      }
    }

    currentCollectionId = await findParentCollectionId(currentCollectionId);
  }

  return [...direct, ...inherited];
}

/**
 * The WebDAV-domain instantiation of {@link getEffectiveLocks}: resolves
 * `resource`'s own direct lock(s) (`CollectionLock` for a `Collection`,
 * `FileLock` for a `FileResource`) and walks up `Collection`'s
 * `parentCollectionId` chain, collecting each ancestor's
 * `Depth: infinity` `CollectionLock`s.
 *
 * @param manager - The `EntityManager` to query with.
 * @param resource - The resource to find effective locks for.
 * @returns Every currently-effective lock, direct locks first.
 */
export async function getEffectiveWebDavLocks(
  manager: EntityManager,
  resource: WebDavTreeResource,
): Promise<EffectiveLock<CollectionLock | FileLock>[]> {
  const findAncestorLocks = (collectionId: string): Promise<CollectionLock[]> =>
    manager
      .getRepository(CollectionLock)
      .findBy({ collectionId, depth: 'infinity' });
  const findParentCollectionId = async (
    collectionId: string,
  ): Promise<string | null> => {
    const collection = await manager
      .getRepository(Collection)
      .findOneByOrFail({ id: collectionId });
    return collection.parentCollectionId;
  };

  if (resource instanceof Collection) {
    const ownLocks = await manager
      .getRepository(CollectionLock)
      .findBy({ collectionId: resource.id });
    return getEffectiveLocks(
      ownLocks,
      resource.parentCollectionId,
      findAncestorLocks,
      findParentCollectionId,
    );
  }

  const ownLocks = await manager
    .getRepository(FileLock)
    .findBy({ fileResourceId: resource.id });
  return getEffectiveLocks(
    ownLocks,
    resource.collectionId,
    findAncestorLocks,
    findParentCollectionId,
  );
}

/**
 * The addressbook-domain instantiation of {@link getEffectiveLocks}:
 * resolves `resource`'s own direct lock(s) (`AddressbookLock` for an
 * `AddressbookCollection`, `AddressObjectLock` for an `AddressObject`)
 * and, for an `AddressObject`, adds its parent addressbook's
 * `Depth: infinity` lock(s).
 *
 * Unlike {@link getEffectiveWebDavLocks}'s `Collection` chain, there is
 * only ever at most one level of inheritance here: addressbooks don't
 * nest (Runde 20), so `findParentCollectionId` always returns `null`,
 * terminating the walk after an `AddressObject`'s single parent
 * addressbook (or immediately, for an `AddressbookCollection` itself).
 *
 * @param manager - The `EntityManager` to query with.
 * @param resource - The resource to find effective locks for.
 * @returns Every currently-effective lock, direct locks first.
 */
export async function getEffectiveAddressbookLocks(
  manager: EntityManager,
  resource: AddressbookAclResource,
): Promise<EffectiveLock<AddressbookLock | AddressObjectLock>[]> {
  const findAncestorLocks = (
    addressbookId: string,
  ): Promise<AddressbookLock[]> =>
    manager
      .getRepository(AddressbookLock)
      .findBy({ addressbookId, depth: 'infinity' });
  const findParentCollectionId = (): Promise<string | null> =>
    Promise.resolve(null);

  if (resource instanceof AddressbookCollection) {
    const ownLocks = await manager
      .getRepository(AddressbookLock)
      .findBy({ addressbookId: resource.id });
    return getEffectiveLocks(
      ownLocks,
      null,
      findAncestorLocks,
      findParentCollectionId,
    );
  }

  const ownLocks = await manager
    .getRepository(AddressObjectLock)
    .findBy({ addressObjectId: resource.id });
  return getEffectiveLocks(
    ownLocks,
    resource.addressbookId,
    findAncestorLocks,
    findParentCollectionId,
  );
}
