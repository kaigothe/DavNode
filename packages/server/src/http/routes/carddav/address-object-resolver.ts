import {
  AddressbookCollection,
  AddressObject,
  type AddressbookAclResource,
  type DataSource,
} from '@davnode/core';

/**
 * Resolves the addressbook named `addressbookName`, owned by
 * `ownerPrincipalId` in `tenantId` — the first of the two path segments
 * GET/PUT/DELETE on `/dav/{tenant}/addressbooks/{userId}/{addressbookName}/{objectName}`
 * need resolved, shared by all three route handlers.
 */
export async function resolveAddressbook(
  dataSource: DataSource,
  tenantId: string,
  ownerPrincipalId: string,
  addressbookName: string,
): Promise<AddressbookCollection | null> {
  return dataSource.getRepository(AddressbookCollection).findOneBy({
    tenantId,
    ownerPrincipalId,
    displayName: addressbookName,
  });
}

/**
 * Resolves the `AddressObject` named `objectName` within `addressbookId`
 * — the second of the two path segments GET/PUT/DELETE resolve, by the
 * same `(addressbookId, name)` identity Extended MKCOL and the
 * addressbook-home PROPFIND route use for `AddressbookCollection`
 * itself (`addressbook-mkcol.route.ts`/`addressbook-home.route.ts`).
 */
export async function resolveAddressObject(
  dataSource: DataSource,
  addressbookId: string,
  objectName: string,
): Promise<AddressObject | null> {
  return dataSource
    .getRepository(AddressObject)
    .findOneBy({ addressbookId, name: objectName });
}

/**
 * Every `AddressObject` directly inside `addressbookId` — used by
 * `carddav/lock.route.ts` to find the `Depth: infinity` "subtree" a
 * lock on the addressbook itself would also cover. Never recurses:
 * unlike `ResourcePathResolver.listChildren`'s arbitrary-depth WebDAV
 * tree, addressbooks don't nest (Runde 20), so this is the whole
 * subtree in one query.
 */
export async function listAddressObjects(
  dataSource: DataSource,
  addressbookId: string,
): Promise<AddressObject[]> {
  return dataSource.getRepository(AddressObject).findBy({ addressbookId });
}

/**
 * Resolves the LOCK/UNLOCK target for
 * `/dav/{tenantSlug}/addressbooks/{userId}{/*splat}`: one segment
 * addresses the `AddressbookCollection` itself, two address a single
 * `AddressObject` inside it — unlike GET/PUT/DELETE (which only ever
 * address a contact), LOCK/UNLOCK can target either, the same way the
 * WebDAV LOCK route can target a `Collection` or a `FileResource`.
 */
export async function resolveLockTarget(
  dataSource: DataSource,
  tenantId: string,
  ownerPrincipalId: string,
  segments: string[],
): Promise<AddressbookAclResource | null> {
  if (segments.length === 1) {
    return resolveAddressbook(
      dataSource,
      tenantId,
      ownerPrincipalId,
      segments[0],
    );
  }
  if (segments.length === 2) {
    const [addressbookName, objectName] = segments;
    const addressbook = await resolveAddressbook(
      dataSource,
      tenantId,
      ownerPrincipalId,
      addressbookName,
    );
    if (!addressbook) {
      return null;
    }
    return resolveAddressObject(dataSource, addressbook.id, objectName);
  }
  return null;
}
