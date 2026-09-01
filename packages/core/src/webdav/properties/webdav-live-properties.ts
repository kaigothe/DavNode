import { Collection } from '../../entities/collection.entity.js';
import { FileResource } from '../../entities/file-resource.entity.js';
import { DAV_NAMESPACE } from '../xml/request-parser.js';
import { escapeXmlText } from '../xml/xml-value.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
  WebDavResource,
} from './property-provider.interface.js';

const LIVE_PROPERTY_NAMES = new Set([
  'creationdate',
  'displayname',
  'getcontentlength',
  'getcontenttype',
  'getetag',
  'getlastmodified',
  'resourcetype',
  'supportedlock',
  'lockdiscovery',
]);

function property(name: string, value: string): PropertyValue {
  return { namespace: DAV_NAMESPACE, name, value };
}

/**
 * The core WebDAV live-property set (RFC 4918 §15), derived from
 * `Collection`/`FileResource`'s own fixed columns rather than the
 * `*_properties` dead-property tables.
 *
 * `supportedlock` and `lockdiscovery` are always returned empty: M2 has
 * no real locking (RFC 4918 Class 2 locking is M4), but both properties
 * are still served — with "no lock types supported"/"no active
 * locks" — for Class 1 spec conformance, per
 * `milestones/M2-webdav-core/00-setting-goal.md`.
 *
 * `getcontentlength`, `getcontenttype`, and `getetag` are only defined
 * for `FileResource`: `Collection` has no matching columns (a
 * collection's "content" is its listing, not a byte stream — see
 * `planning/05-data-model.md`), so this provider omits them for
 * collections rather than fabricating a value.
 */
export class WebDavLiveProperties implements PropertyProvider {
  /**
   * See {@link PropertyProvider.listLiveProperties}. Ignores `context` —
   * every property here is derived purely from `resource`'s own columns.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface even though this implementation has no actual await.
  async listLiveProperties(
    resource: WebDavResource,
    _context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    const properties: PropertyValue[] = [
      property('creationdate', resource.createdAt.toISOString()),
      property('getlastmodified', resource.updatedAt.toUTCString()),
      property('supportedlock', ''),
      property('lockdiscovery', ''),
    ];

    if (resource instanceof Collection) {
      properties.push(
        property('displayname', escapeXmlText(resource.displayName)),
        property('resourcetype', `<D:collection xmlns:D="${DAV_NAMESPACE}"/>`),
      );
    } else if (resource instanceof FileResource) {
      properties.push(
        property('displayname', escapeXmlText(resource.name)),
        property('resourcetype', ''),
        property('getcontentlength', String(resource.sizeBytes)),
        property('getcontenttype', escapeXmlText(resource.contentType)),
        property('getetag', escapeXmlText(resource.etag)),
      );
    }

    return properties;
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === DAV_NAMESPACE && LIVE_PROPERTY_NAMES.has(name);
  }
}
