import {
  AddressbookCollection,
  AddressObject,
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
