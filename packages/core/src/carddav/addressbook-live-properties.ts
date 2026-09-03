import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import { escapeXmlText } from '../webdav/xml/xml-value.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import {
  AddressbookHomeCollection,
  type AddressbookHomeTreeResource,
} from './addressbook-home-tree-resource.js';
import { CARDDAV_NAMESPACE } from './carddav-namespace.js';

const DAV_LIVE_PROPERTY_NAMES = new Set([
  'creationdate',
  'displayname',
  'getlastmodified',
  'resourcetype',
]);

const CARDDAV_LIVE_PROPERTY_NAMES = new Set(['addressbook-description']);

function property(
  namespace: string,
  name: string,
  value: string,
): PropertyValue {
  return { namespace, name, value };
}

/**
 * Live properties for the `/dav/{tenant}/addressbooks/{userId}/`
 * subtree (`addressbook-home.route.ts`): the virtual home collection
 * itself, and each of its owner's actual `AddressbookCollection` rows.
 * Mirrors `WebDavLiveProperties` (M2) for this domain.
 *
 * An `AddressbookCollection`'s `resourcetype` reports **both**
 * `DAV:collection` and `CARDDAV:addressbook` — RFC 6352 §5.2: "An
 * address book collection MUST report the DAV:collection and
 * CARDDAV:addressbook XML elements in the value of the
 * DAV:resourcetype property." The home collection itself is just an
 * ordinary `DAV:collection`: RFC 6352 §7.1.1 allows
 * `addressbook-home-set` to point at "ordinary collections that have
 * child or descendant address book collections", not only actual
 * address books, and this server's home is exactly that — a container,
 * never an addressbook in its own right.
 */
export class AddressbookLiveProperties
  implements PropertyProvider<AddressbookHomeTreeResource>
{
  /**
   * See {@link PropertyProvider.listLiveProperties}. Ignores `context` —
   * every property here is derived purely from `resource`'s own data.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface even though this implementation has no actual await.
  async listLiveProperties(
    resource: AddressbookHomeTreeResource,
    _context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    if (resource instanceof AddressbookHomeCollection) {
      return [
        property(DAV_NAMESPACE, 'displayname', escapeXmlText('addressbooks')),
        property(
          DAV_NAMESPACE,
          'resourcetype',
          `<D:collection xmlns:D="${DAV_NAMESPACE}"/>`,
        ),
      ];
    }

    const properties: PropertyValue[] = [
      property(
        DAV_NAMESPACE,
        'creationdate',
        resource.createdAt.toISOString(),
      ),
      property(
        DAV_NAMESPACE,
        'getlastmodified',
        resource.updatedAt.toUTCString(),
      ),
      property(
        DAV_NAMESPACE,
        'displayname',
        escapeXmlText(resource.displayName),
      ),
      property(
        DAV_NAMESPACE,
        'resourcetype',
        `<D:collection xmlns:D="${DAV_NAMESPACE}"/><C:addressbook xmlns:C="${CARDDAV_NAMESPACE}"/>`,
      ),
    ];
    if (resource.description !== null) {
      properties.push(
        property(
          CARDDAV_NAMESPACE,
          'addressbook-description',
          escapeXmlText(resource.description),
        ),
      );
    }
    return properties;
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    if (namespace === DAV_NAMESPACE) {
      return DAV_LIVE_PROPERTY_NAMES.has(name);
    }
    if (namespace === CARDDAV_NAMESPACE) {
      return CARDDAV_LIVE_PROPERTY_NAMES.has(name);
    }
    return false;
  }
}
