import type { EntityManager } from 'typeorm';
import { AddressbookAce } from '../entities/addressbook-ace.entity.js';
import { AddressbookCollection } from '../entities/addressbook-collection.entity.js';
import { AddressObjectAce } from '../entities/address-object-ace.entity.js';
import { CalendarAce } from '../entities/calendar-ace.entity.js';
import { CalendarCollection } from '../entities/calendar-collection.entity.js';
import { CalendarObjectAce } from '../entities/calendar-object-ace.entity.js';
import {
  CollectionAce,
  type GrantDeny,
} from '../entities/collection-ace.entity.js';
import { Collection } from '../entities/collection.entity.js';
import { FileAce } from '../entities/file-ace.entity.js';
import type { AddressbookAclResource } from '../carddav/addressbook-acl-resource.js';
import type { CalendarAclResource } from '../caldav/calendar-acl-resource.js';
import type { WebDavTreeResource } from '../webdav/resource-path-resolver.js';
import type { CalendarPrivilege, Privilege } from './privilege.js';

/**
 * The shape every domain's ACE row shares (see the ACE entities,
 * `CollectionAce`/`FileAce` and their addressbook/calendar counterparts)
 * — everything {@link collectAces}'s ordering and inheritance logic
 * needs, independent of which specific foreign key column ties a row to
 * its resource.
 *
 * Generic over the privilege vocabulary: the shared {@link Privilege}
 * for WebDAV and CardDAV, {@link CalendarPrivilege} (which adds
 * `read-free-busy`) for the calendar tables.
 */
export interface AceLike<TPrivilege extends CalendarPrivilege = Privilege> {
  id: string;
  principalId: string;
  privilege: TPrivilege;
  grantDeny: GrantDeny;
  protected: boolean;
  position: number;
}

/** One ACE as returned by {@link collectAces}: the stored row, plus where it came from. */
export type CollectedAce<TAce extends AceLike<CalendarPrivilege>> = TAce & {
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
  TAce extends AceLike<CalendarPrivilege>,
  TCollectionAce extends AceLike<CalendarPrivilege>,
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

/**
 * The addressbook-domain instantiation of {@link collectAces}: resolves
 * `resource`'s own ACEs (`AddressbookAce` if it's an
 * `AddressbookCollection`, `AddressObjectAce` if it's an `AddressObject`)
 * and, for an `AddressObject`, adds its parent addressbook's ACEs.
 *
 * Unlike {@link collectWebDavAces}'s `Collection` chain, there is only
 * ever at most one level of inheritance here: addressbooks don't nest
 * (Runde 20 — see `AddressbookCollection`'s doc comment), so
 * `findParentCollectionId` always returns `null`, terminating the walk
 * after an `AddressObject`'s single parent addressbook (or immediately,
 * for an `AddressbookCollection` itself, which has no ancestor to
 * inherit from at all).
 *
 * @param manager - The `EntityManager` to query with.
 * @param resource - The resource to collect ACEs for.
 * @returns The combined, ordered ACE list.
 */
export async function collectAddressbookAces(
  manager: EntityManager,
  resource: AddressbookAclResource,
): Promise<CollectedAce<AddressbookAce | AddressObjectAce>[]> {
  const findCollectionAces = (
    addressbookId: string,
  ): Promise<AddressbookAce[]> =>
    manager.getRepository(AddressbookAce).findBy({ addressbookId });
  const findParentCollectionId = (): Promise<string | null> =>
    Promise.resolve(null);

  if (resource instanceof AddressbookCollection) {
    const ownAces = await manager
      .getRepository(AddressbookAce)
      .findBy({ addressbookId: resource.id });
    return collectAces(
      ownAces,
      null,
      findCollectionAces,
      findParentCollectionId,
    );
  }

  const ownAces = await manager
    .getRepository(AddressObjectAce)
    .findBy({ addressObjectId: resource.id });
  return collectAces(
    ownAces,
    resource.addressbookId,
    findCollectionAces,
    findParentCollectionId,
  );
}

/**
 * The calendar-domain instantiation of {@link collectAces}: resolves
 * `resource`'s own ACEs (`CalendarAce` if it's a `CalendarCollection`,
 * `CalendarObjectAce` if it's a `CalendarObject`) and, for a
 * `CalendarObject`, adds its parent calendar's ACEs.
 *
 * Like {@link collectAddressbookAces}, at most one level of inheritance:
 * calendars don't nest (Runde 21, see `CalendarCollection`'s doc comment),
 * so `findParentCollectionId` always returns `null`, ending the walk after
 * an object's single parent calendar (or at once, for a calendar itself).
 *
 * @param manager - The `EntityManager` to query with.
 * @param resource - The resource to collect ACEs for.
 * @returns The combined, ordered ACE list.
 */
export async function collectCalendarAces(
  manager: EntityManager,
  resource: CalendarAclResource,
): Promise<CollectedAce<CalendarAce | CalendarObjectAce>[]> {
  const findCollectionAces = (calendarId: string): Promise<CalendarAce[]> =>
    manager.getRepository(CalendarAce).findBy({ calendarId });
  const findParentCollectionId = (): Promise<string | null> =>
    Promise.resolve(null);

  if (resource instanceof CalendarCollection) {
    const ownAces = await manager
      .getRepository(CalendarAce)
      .findBy({ calendarId: resource.id });
    return collectAces(
      ownAces,
      null,
      findCollectionAces,
      findParentCollectionId,
    );
  }

  const ownAces = await manager
    .getRepository(CalendarObjectAce)
    .findBy({ calendarObjectId: resource.id });
  return collectAces(
    ownAces,
    resource.calendarId,
    findCollectionAces,
    findParentCollectionId,
  );
}
