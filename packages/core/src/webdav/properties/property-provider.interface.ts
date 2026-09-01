import type { Collection } from '../../entities/collection.entity.js';
import type { FileResource } from '../../entities/file-resource.entity.js';
import type { PropertyName } from '../xml/request-parser.js';

/**
 * A resource a {@link PropertyProvider} can compute live properties for.
 * Live properties differ by resource type (e.g. `resourcetype` is
 * `<D:collection/>` for a `Collection` but empty for a `FileResource`),
 * so providers narrow this union themselves (e.g. via `instanceof`).
 */
export type WebDavResource = Collection | FileResource;

/**
 * A live property's computed value. Uses the same XML-content contract
 * as a dead property's stored value (see `serializeElementChildren`/
 * `embedRawXmlContent` in `../xml/xml-value.ts`): plain text is
 * pre-escaped, nested content is valid, embeddable XML.
 */
export interface PropertyValue extends PropertyName {
  value: string;
}

/**
 * A source of **live properties**: properties derived from a resource's
 * own fixed data (e.g. `getetag` from `FileResource.etag`), as opposed
 * to **dead properties**, which are arbitrary client-set values stored
 * verbatim in the `*_properties` tables (see
 * `milestones/M2-webdav-core/01-webdav-domain-entities/03-dead-properties-tables.md`).
 *
 * Implemented by {@link WebDavLiveProperties} for the core WebDAV
 * property set, and registered into a {@link PropertyProviderRegistry}
 * so later milestones (M3 ACL properties like `owner`/`acl`, M5/M6
 * CalDAV/CardDAV properties) can contribute more live properties
 * without PROPFIND/PROPPATCH needing to change.
 */
export interface PropertyProvider {
  /** Every live property this provider defines for `resource`. */
  listLiveProperties(resource: WebDavResource): PropertyValue[];

  /**
   * Whether `namespace`/`name` names a live property this provider
   * defines — regardless of whether the specific resource currently
   * being processed would actually expose it. PROPPATCH uses this to
   * reject attempts to modify protected properties (RFC 4918 §9.2,
   * `cannot-modify-protected-property`) before it ever loads a
   * resource, so the check can't depend on one.
   */
  isLiveProperty(namespace: string, name: string): boolean;
}
