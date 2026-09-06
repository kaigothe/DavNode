import type { AddressbookCollection } from '../entities/addressbook-collection.entity.js';
import type { AddressObject } from '../entities/address-object.entity.js';

/**
 * Everything the addressbook domain's ACL evaluation
 * (`collectAddressbookAces`/`hasAddressbookPrivilege`) can check a
 * privilege against — the CardDAV analog of `WebDavTreeResource`
 * (`webdav/resource-path-resolver.ts`). Deliberately excludes
 * `AddressbookHomeCollection`: the virtual home has no ACE table of its
 * own to evaluate (see `AddressbookHomeCollection`'s doc comment) — its
 * own routes keep the simpler ownership check this type's introduction
 * doesn't change.
 */
export type AddressbookAclResource = AddressbookCollection | AddressObject;
