import { hasAddressbookPrivilege } from '../acl/evaluate-privilege.js';
import { AddressObject } from '../entities/address-object.entity.js';
import { PropertyProviderRegistry } from '../webdav/properties/property-provider-registry.js';
import type {
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import type { ReportContext } from '../webdav/report-registry.js';
import type {
  SyncCollectionDomain,
  SyncCollectionMember,
  SyncCollectionTarget,
} from '../webdav/sync/sync-collection-domain.js';
import type { PropertyName } from '../webdav/xml/request-parser.js';
import { AddressObjectLiveProperties } from './address-object-live-properties.js';
import { AddressbookChangeLog } from './addressbook-change-log.js';
import {
  resolveReportAddressbook,
  toAddressbookUrl,
} from './addressbook-report-support.js';

/**
 * The addressbook tree's side of `sync-collection`
 * (`/dav/{tenant}/addressbooks/{userId}/{addressbookName}`, RFC 6578 as
 * applied to RFC 6352 addressbooks): the target is one
 * `AddressbookCollection`, authorization is `read` via
 * `hasAddressbookPrivilege`, the change log is `addressbook_changes`, and
 * members are the addressbook's `AddressObject`s carrying
 * `AddressObjectLiveProperties`.
 *
 * The addressbook is resolved by `resolveReportAddressbook`, shared with
 * the CardDAV query/multiget reports: it accepts a trailing slash on the
 * Request-URI and answers a `{userId}` that isn't a UUID with "not found"
 * (Postgres would otherwise fail the query with a `500`).
 *
 * Only live properties are resolved for members: there is no dead-
 * property service for the addressbook domain yet (no PROPPATCH route
 * writes `address_object_properties`), so a requested property this
 * provider doesn't define is reported `404` in its `<D:propstat>`.
 */
export class AddressbookSyncCollectionDomain implements SyncCollectionDomain {
  private readonly changeLog = new AddressbookChangeLog();
  private readonly registry = new PropertyProviderRegistry<AddressObject>();

  constructor() {
    this.registry.register(new AddressObjectLiveProperties());
  }

  /** See {@link SyncCollectionDomain.resolveTarget}. */
  async resolveTarget(
    context: ReportContext,
  ): Promise<SyncCollectionTarget | null> {
    const addressbook = await resolveReportAddressbook(context);
    if (!addressbook) {
      return null;
    }

    const addressbookHref = toAddressbookUrl(addressbook, context.tenant);
    const propertyContext: PropertyProviderContext = {
      tenant: context.tenant,
      principal: context.principal,
      manager: context.manager,
    };

    return {
      id: addressbook.id,
      syncSeq: addressbook.syncSeq,
      changeLog: this.changeLog,
      canRead: () =>
        hasAddressbookPrivilege(
          context.manager,
          context.principal,
          addressbook,
          'read',
        ),
      resolveHref: () => Promise.resolve(addressbookHref),
      listMembers: async (): Promise<SyncCollectionMember[]> => {
        const contacts = await context.manager
          .getRepository(AddressObject)
          .findBy({ addressbookId: addressbook.id });
        return contacts.map((contact) => ({
          name: contact.name,
          resolveHref: () =>
            Promise.resolve(
              `${addressbookHref}/${encodeURIComponent(contact.name)}`,
            ),
          resolveProperties: async (requested: readonly PropertyName[]) => {
            const live: PropertyValue[] =
              await this.registry.listLiveProperties(contact, propertyContext);
            return requested.map((request) => {
              const found = live.find(
                (p) =>
                  p.namespace === request.namespace && p.name === request.name,
              );
              return found
                ? { ...found, status: 200 }
                : { ...request, status: 404 };
            });
          },
        }));
      },
    };
  }
}
