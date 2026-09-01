import type { EntityManager } from 'typeorm';
import { CollectionAce, type GrantDeny } from '../entities/collection-ace.entity.js';
import { Collection } from '../entities/collection.entity.js';
import { FileAce } from '../entities/file-ace.entity.js';
import type { WebDavTreeResource } from '../webdav/resource-path-resolver.js';
import type { Privilege } from './privilege.js';

/**
 * The shape every domain's ACE row shares (see the ACE entities,
 * `CollectionAce`/`FileAce`, and their future calendar/addressbook
 * counterparts, M5/M6) — everything {@link collectAces}'s ordering and
 * inheritance logic needs, independent of which specific foreign key
 * column ties a row to its resource.
 */
export interface AceLike {
  id: string;
  principalId: string;
  privilege: Privilege;
  grantDeny: GrantDeny;
  protected: boolean;
  position: number;
}

/** One ACE as returned by {@link collectAces}: the stored row, plus where it came from. */
export type CollectedAce<TAce extends AceLike> = TAce & {
  /**
   * `false` for a direct ACE on the resource itself, `true` for one
   * inherited from an ancestor collection.
   */
  inherited: boolean;
  /**
   * The ancestor collection this ACE was inherited from, or `null` for a
   * direct (non-inherited) ACE.
   */
  inheritedFrom: string | null;
};

/**
 * Builds the ordered, inheritance-annotated ACE list RFC 3744 §5.4
 * evaluation needs for one resource: the resource's own ACEs first (in
 * their stored `position` order), then every ancestor collection's ACEs
 * — nearest ancestor first, each again in its own `position` order.
 *
 * Generic over both the resource's own ACE row type (`TAce`) and the ACE
 * row type of the collections it inherits from (`TCollectionAce`) — for
 * `Collection`/`FileResource` both resolve to `CollectionAce`/`FileAce`
 * (see {@link collectWebDavAces}), and M5/M6 can call this same function
 * with their own ACE entities and fetchers instead of reimplementing the
 * traversal (see `milestones/M3-webdav-acl/03-acl-evaluation-engine`).
 *
 * `findCollectionAces`/`findParentCollectionId` are supplied by the
 * caller — rather than this function opening its own repositories —
 * so it carries no compile-time dependency on any specific domain's
 * entities. Guards against a cycle in the collection hierarchy (which
 * shouldn't exist, but costs nothing to guard against) via a
 * visited-ids set.
 *
 * @param ownAces - The resource's own direct ACEs, unsorted.
 * @param startCollectionId - The collection inheritance starts from:
 * the resource's own parent collection if it's itself a collection, or
 * its containing collection if it's a leaf object. `null` if the
 * resource has no ancestor to inherit from (the tenant's root
 * collection).
 * @param findCollectionAces - Fetches one collection's own direct ACEs.
 * @param findParentCollectionId - Fetches a collection's parent id, or
 * `null` if it has none (the walk's termination case).
 * @returns The combined, ordered ACE list.
 */
export async function collectAces<
  TAce extends AceLike,
  TCollectionAce extends AceLike,
>(
  ownAces: readonly TAce[],
  startCollectionId: string | null,
  findCollectionAces: (collectionId: string) => Promise<TCollectionAce[]>,
  findParentCollectionId: (collectionId: string) => Promise<string | null>,
): Promise<CollectedAce<TAce | TCollectionAce>[]> {
  const direct: CollectedAce<TAce>[] = [...ownAces]
    .sort((a, b) => a.position - b.position)
    .map((ace) => ({ ...ace, inherited: false, inheritedFrom: null }));

  const inherited: CollectedAce<TCollectionAce>[] = [];
  const visitedCollectionIds = new Set<string>();
  let currentCollectionId = startCollectionId;

  while (
    currentCollectionId !== null &&
    !visitedCollectionIds.has(currentCollectionId)
  ) {
    visitedCollectionIds.add(currentCollectionId);
    const collectionAces = await findCollectionAces(currentCollectionId);
    const sorted = [...collectionAces].sort((a, b) => a.position - b.position);
    for (const ace of sorted) {
      inherited.push({
        ...ace,
        inherited: true,
        inheritedFrom: currentCollectionId,
      });
    }
    currentCollectionId = await findParentCollectionId(currentCollectionId);
  }

  return [...direct, ...inherited];
}

/**
 * The WebDAV-domain instantiation of {@link collectAces}: resolves
 * `resource`'s own ACEs (`CollectionAce` if it's a `Collection`,
 * `FileAce` if it's a `FileResource`) and walks up `Collection`'s
 * `parentCollectionId` chain to the tenant's root collection for
 * inherited ACEs.
 *
 * @param manager - The `EntityManager` to query with.
 * @param resource - The resource to collect ACEs for.
 * @returns The combined, ordered ACE list.
 */
export async function collectWebDavAces(
  manager: EntityManager,
  resource: WebDavTreeResource,
): Promise<CollectedAce<CollectionAce | FileAce>[]> {
  const findCollectionAces = (collectionId: string): Promise<CollectionAce[]> =>
    manager.getRepository(CollectionAce).findBy({ collectionId });
  const findParentCollectionId = async (
    collectionId: string,
  ): Promise<string | null> => {
    const collection = await manager
      .getRepository(Collection)
      .findOneByOrFail({ id: collectionId });
    return collection.parentCollectionId;
  };

  if (resource instanceof Collection) {
    const ownAces = await manager
      .getRepository(CollectionAce)
      .findBy({ collectionId: resource.id });
    return collectAces(
      ownAces,
      resource.parentCollectionId,
      findCollectionAces,
      findParentCollectionId,
    );
  }

  const ownAces = await manager
    .getRepository(FileAce)
    .findBy({ fileResourceId: resource.id });
  return collectAces(
    ownAces,
    resource.collectionId,
    findCollectionAces,
    findParentCollectionId,
  );
}
