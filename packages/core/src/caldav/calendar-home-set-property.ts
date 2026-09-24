import { fragment } from 'xmlbuilder2';
import { User } from '../entities/user.entity.js';
import type { PrincipalTreeResource } from '../principals/principal-tree-resource.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import { CALDAV_NAMESPACE } from './caldav-namespace.js';
import { toCalendarHomeUrl } from './calendar-home-url.js';

const LIVE_PROPERTY_NAMES = new Set(['calendar-home-set']);

function hrefValue(url: string): string {
  return fragment().ele(DAV_NAMESPACE, 'D:href').txt(url).toString();
}

/**
 * Contributes `CALDAV:calendar-home-set` (RFC 4791 §6.2.1) to the
 * `/principals/` tree's live properties — registered as its own
 * `PropertyProvider` into the same
 * `PropertyProviderRegistry<PrincipalTreeResource>` `principals.route.ts`
 * already builds, next to `AddressbookHomeSetProperty`, which this
 * mirrors.
 *
 * Only `User` principals get a value — groups and special principals
 * have no calendar home of their own.
 */
export class CalendarHomeSetProperty implements PropertyProvider<PrincipalTreeResource> {
  /** See {@link PropertyProvider.listLiveProperties}. */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface even though this implementation has no actual await.
  async listLiveProperties(
    resource: PrincipalTreeResource,
    context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    if (!(resource instanceof User)) {
      return [];
    }
    const homeUrl = toCalendarHomeUrl(resource.principalId, context.tenant);
    return [
      {
        namespace: CALDAV_NAMESPACE,
        name: 'calendar-home-set',
        value: hrefValue(homeUrl),
      },
    ];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === CALDAV_NAMESPACE && LIVE_PROPERTY_NAMES.has(name);
  }
}
