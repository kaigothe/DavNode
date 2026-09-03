import type { AddressbookCollection } from '../entities/addressbook-collection.entity.js';

/**
 * The synthetic (non-DB-backed) `/dav/{tenant}/addressbooks/{userId}/`
 * home collection itself (RFC 6352 §7.1.1) — holds the owning user
 * principal's id, since PROPFIND needs to resolve and report
 * properties for this URL without any DB row of its own. Same
 * technique as `VirtualPrincipalCollection` (M3,
 * `principals/principal-tree-resource.ts`).
 */
export class AddressbookHomeCollection {
  constructor(public readonly ownerPrincipalId: string) {}
}

/**
 * Everything a PROPFIND request against
 * `/dav/{tenant}/addressbooks/{userId}{/*splat}` can resolve to
 * (`addressbook-home.route.ts`): the virtual home collection itself, or
 * one of its owner's actual `AddressbookCollection` rows.
 */
export type AddressbookHomeTreeResource =
  | AddressbookHomeCollection
  | AddressbookCollection;
