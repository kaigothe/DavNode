import { fragment } from 'xmlbuilder2';
import { User } from '../entities/user.entity.js';
import type { PrincipalTreeResource } from '../principals/principal-tree-resource.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import { toAddressbookHomeUrl } from './addressbook-home-url.js';
import { CARDDAV_NAMESPACE } from './carddav-namespace.js';

const LIVE_PROPERTY_NAMES = new Set(['addressbook-home-set']);

function hrefValue(url: string): string {
  return fragment().ele(DAV_NAMESPACE, 'D:href').txt(url).toString();
}

/**
 * Contributes `CARDDAV:addressbook-home-set` (RFC 6352 §7.1.1) to the
 * `/principals/` tree's live properties — registered as its own
 * `PropertyProvider` into the same `PropertyProviderRegistry<PrincipalTreeResource>`
 * `principals.route.ts` already builds, alongside `PrincipalLiveProperties`,
 * rather than added to that class directly, per its own doc comment
 * ("later milestones can register more principal properties here ...
 * without this file changing").
 *
 * Only `User` principals get a value — groups and special principals
 * have no addressbook home of their own.
 */
export class AddressbookHomeSetProperty
  implements PropertyProvider<PrincipalTreeResource>
{
  /** See {@link PropertyProvider.listLiveProperties}. */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface even though this implementation has no actual await.
  async listLiveProperties(
    resource: PrincipalTreeResource,
    context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    if (!(resource instanceof User)) {
      return [];
    }
    const homeUrl = toAddressbookHomeUrl(
      resource.principalId,
      context.tenant,
    );
    return [
      {
        namespace: CARDDAV_NAMESPACE,
        name: 'addressbook-home-set',
        value: hrefValue(homeUrl),
      },
    ];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === CARDDAV_NAMESPACE && LIVE_PROPERTY_NAMES.has(name);
  }
}
