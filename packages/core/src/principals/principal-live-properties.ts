import { User } from '../entities/user.entity.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import { escapeXmlText } from '../webdav/xml/xml-value.js';
import type {
  PropertyProvider,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import {
  VirtualPrincipalCollection,
  type PrincipalTreeResource,
} from './principal-tree-resource.js';

const LIVE_PROPERTY_NAMES = new Set(['displayname', 'resourcetype']);

function property(name: string, value: string): PropertyValue {
  return { namespace: DAV_NAMESPACE, name, value };
}

/**
 * The base live-property set for the `/principals/` subtree (RFC 3744
 * §5.8, M3's principals-collection-route sub-task): `displayname` and
 * `resourcetype` for both the synthetic `/principals/`,
 * `/principals/users/`, `/principals/groups/` collection nodes and
 * individual user/group principals.
 *
 * Registered into its own `PropertyProviderRegistry<PrincipalTreeResource>`
 * (`principals.route.ts`), separate from the WebDAV file tree's registry
 * — principals aren't `Collection`/`FileResource` rows, so they need
 * their own resource type and provider set. Later milestones can
 * register more principal properties here (M5: `CARD:addressbook-home-set`,
 * M6: `CALDAV:calendar-home-set`) without this file changing.
 */
export class PrincipalLiveProperties
  implements PropertyProvider<PrincipalTreeResource>
{
  /** See {@link PropertyProvider.listLiveProperties}. */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface even though this implementation has no actual await.
  async listLiveProperties(
    resource: PrincipalTreeResource,
  ): Promise<PropertyValue[]> {
    if (resource instanceof VirtualPrincipalCollection) {
      const displayName = resource.kind === 'root' ? 'principals' : resource.kind;
      return [
        property('displayname', escapeXmlText(displayName)),
        property('resourcetype', `<D:collection xmlns:D="${DAV_NAMESPACE}"/>`),
      ];
    }

    const displayName = resource instanceof User ? resource.username : resource.name;
    return [
      property('displayname', escapeXmlText(displayName)),
      property('resourcetype', `<D:principal xmlns:D="${DAV_NAMESPACE}"/>`),
    ];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === DAV_NAMESPACE && LIVE_PROPERTY_NAMES.has(name);
  }
}
