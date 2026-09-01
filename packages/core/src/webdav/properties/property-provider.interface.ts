import type { EntityManager } from 'typeorm';
import type { Collection } from '../../entities/collection.entity.js';
import type { FileResource } from '../../entities/file-resource.entity.js';
import type { Principal } from '../../entities/principal.entity.js';
import type { Tenant } from '../../entities/tenant.entity.js';
import type { PropertyName } from '../xml/request-parser.js';

/**
 * A resource a {@link PropertyProvider} can compute live properties for.
 * Live properties differ by resource type (e.g. `resourcetype` is
 * `<D:collection/>` for a `Collection` but empty for a `FileResource`),
 * so providers narrow this union themselves (e.g. via `instanceof`).
 */
export type WebDavResource = Collection | FileResource;

/**
 * Per-request context a {@link PropertyProvider} may need beyond the
 * resource itself — the tenant and requesting principal (both needed to
 * build principal URLs, e.g. `DAV:owner`/`DAV:current-user-principal`),
 * and an `EntityManager` for properties that need their own DB access
 * (e.g. `DAV:acl`, `DAV:current-user-privilege-set` — M3's ACL
 * properties). Added once M3's ACL properties revealed that the M2
 * property-provider abstraction's original resource-only,
 * synchronous shape couldn't actually support a principal/tenant/DB-
 * dependent property without this — see
 * `milestones/M3-webdav-acl/05-acl-properties`.
 */
export interface PropertyProviderContext {
  tenant: Tenant;
  principal: Principal;
  manager: EntityManager;
}

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
 * own fixed data (e.g. `getetag` from `FileResource.etag`) or from
 * per-request context (e.g. `DAV:acl`), as opposed to **dead
 * properties**, which are arbitrary client-set values stored verbatim in
 * the `*_properties` tables (see
 * `milestones/M2-webdav-core/01-webdav-domain-entities/03-dead-properties-tables.md`).
 *
 * Generic over the resource type (`TResource`) so the same mechanism
 * backs more than one resource tree with its own, unrelated property
 * set — the WebDAV file tree (`WebDavLiveProperties`/
 * `AclPropertiesProvider`, resource type {@link WebDavResource}) and,
 * from M3's principals-collection-route sub-task on, the `/principals/`
 * tree (`PrincipalLiveProperties`, resource type `PrincipalTreeResource`
 * — a `Principal`, not a `Collection`/`FileResource`, so it needs its
 * own `PropertyProviderRegistry<PrincipalTreeResource>` instance rather
 * than joining the file tree's). Each is registered into its own
 * {@link PropertyProviderRegistry} so later milestones (M5/M6
 * CalDAV/CardDAV properties on either tree) can contribute more live
 * properties without PROPFIND/PROPPATCH needing further interface
 * changes.
 */
export interface PropertyProvider<TResource> {
  /** Every live property this provider defines for `resource`. */
  listLiveProperties(
    resource: TResource,
    context: PropertyProviderContext,
  ): Promise<PropertyValue[]>;

  /**
   * Whether `namespace`/`name` names a live property this provider
   * defines — regardless of whether the specific resource currently
   * being processed would actually expose it. PROPPATCH uses this to
   * reject attempts to modify protected properties (RFC 4918 §9.2,
   * `cannot-modify-protected-property`) before it ever loads a
   * resource, so the check can't depend on one. Deliberately stays
   * synchronous and context-free: it's a static namespace/name lookup,
   * unlike `listLiveProperties`.
   */
  isLiveProperty(namespace: string, name: string): boolean;
}
