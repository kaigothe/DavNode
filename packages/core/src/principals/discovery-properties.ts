import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import { toPrincipalUrl } from './principal-url.js';

const NAMES = new Set(['current-user-principal', 'principal-collection-set']);

const href = (url: string): string =>
  `<D:href xmlns:D="${DAV_NAMESPACE}">${url}</D:href>`;

/**
 * The two properties clients use to find their way from a bare server URL to
 * their own data (M11, client discovery):
 *
 * - `DAV:current-user-principal` (RFC 5397): the URL of the authenticated
 *   user's principal, from which the client reads `calendar-home-set` and
 *   `addressbook-home-set`. Asked of the base URL by clients that were given
 *   only that.
 * - `DAV:principal-collection-set` (RFC 3744 §5.8): where the tenant's
 *   principals live.
 *
 * Neither depends on the resource they are asked of — they describe the
 * requester and the tenant — so the provider is generic over the resource
 * type and is registered into every resource tree's registry, like
 * `QuotaPropertiesProvider`.
 */
export class DiscoveryPropertiesProvider<
  TResource,
> implements PropertyProvider<TResource> {
  /** See {@link PropertyProvider.listLiveProperties}. */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface; the values come from the request context.
  async listLiveProperties(
    _resource: TResource,
    context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    const properties: PropertyValue[] = [
      {
        namespace: DAV_NAMESPACE,
        name: 'principal-collection-set',
        value: href(`/dav/${context.tenant.slug}/principals/`),
      },
    ];
    if (context.principal.kind === 'user') {
      properties.push({
        namespace: DAV_NAMESPACE,
        name: 'current-user-principal',
        value: href(toPrincipalUrl(context.principal, context.tenant)),
      });
    }
    return properties;
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === DAV_NAMESPACE && NAMES.has(name);
  }
}
