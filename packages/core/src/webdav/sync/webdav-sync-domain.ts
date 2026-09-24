import { AclPropertiesProvider } from '../../acl/acl-properties-provider.js';
import { hasPrivilege } from '../../acl/evaluate-privilege.js';
import { Collection } from '../../entities/collection.entity.js';
import { LockPropertiesProvider } from '../locking/lock-properties-provider.js';
import { DeadPropertyService } from '../properties/dead-property.service.js';
import { PropertyProviderRegistry } from '../properties/property-provider-registry.js';
import type {
  PropertyProviderContext,
  PropertyValue,
  WebDavResource,
} from '../properties/property-provider.interface.js';
import { WebDavLiveProperties } from '../properties/webdav-live-properties.js';
import type { ReportContext } from '../report-registry.js';
import {
  ResourcePathResolver,
  resolveCollectionHref,
  resolveResourceHref,
  type WebDavTreeResource,
} from '../resource-path-resolver.js';
import type { MultistatusPropertyResult } from '../xml/multistatus-builder.js';
import type { PropertyName } from '../xml/request-parser.js';
import { CollectionChangeLog } from './change-log.js';
import type {
  SyncCollectionDomain,
  SyncCollectionMember,
  SyncCollectionTarget,
} from './sync-collection-domain.js';

/** `resource`'s own path segment: a `Collection`'s `displayName`, or a `FileResource`'s `name`. */
function resourceName(resource: WebDavTreeResource): string {
  return resource instanceof Collection ? resource.displayName : resource.name;
}

/**
 * Resolves `requested` against `resource`'s combined live + dead
 * properties — conceptually the same "found → 200, not found → 404"
 * lookup PROPFIND's own `prop`-mode request uses
 * (`packages/server/src/http/routes/propfind.route.ts`), reimplemented
 * here rather than shared: this report only ever needs that one mode
 * (RFC 6578 §6.1's `<D:prop>` has no `allprop`/`propname` equivalent),
 * and PROPFIND's version is server-package-private, not something a
 * `@davnode/core` report handler can import.
 */
async function resolveRequestedProperties(
  resource: WebDavResource,
  requested: readonly PropertyName[],
  registry: PropertyProviderRegistry<WebDavResource>,
  deadProperties: DeadPropertyService,
  context: PropertyProviderContext,
): Promise<MultistatusPropertyResult[]> {
  const live = await registry.listLiveProperties(resource, context);
  const dead =
    resource instanceof Collection
      ? await deadProperties.listForCollection(resource.id)
      : await deadProperties.listForFileResource(resource.id);
  const all: PropertyValue[] = [...live, ...dead];

  return requested.map((request) => {
    const found = all.find(
      (p) => p.namespace === request.namespace && p.name === request.name,
    );
    return found ? { ...found, status: 200 } : { ...request, status: 404 };
  });
}

/**
 * The WebDAV file tree's side of `sync-collection`
 * (`/dav/{tenant}/files/...`): the target must be a `Collection`,
 * authorization is `hasPrivilege(..., 'read')`, and members carry the
 * WebDAV live properties plus ACL/lock properties and any dead
 * properties.
 */
export class WebDavSyncCollectionDomain implements SyncCollectionDomain {
  private readonly changeLog = new CollectionChangeLog();
  private readonly registry = new PropertyProviderRegistry<WebDavResource>();

  constructor() {
    this.registry.register(new WebDavLiveProperties());
    this.registry.register(new AclPropertiesProvider());
    this.registry.register(new LockPropertiesProvider());
  }

  /** See {@link SyncCollectionDomain.resolveTarget}. */
  async resolveTarget(
    context: ReportContext,
  ): Promise<SyncCollectionTarget | null> {
    if (context.segments[0] !== 'files') {
      return null;
    }
    const resourcePathResolver = new ResourcePathResolver(
      context.manager.connection,
    );
    const target = await resourcePathResolver.resolve(
      context.tenant.id,
      context.segments.slice(1),
    );
    if (!target || !(target instanceof Collection)) {
      return null;
    }

    const deadProperties = new DeadPropertyService(context.manager.connection);
    const propertyContext: PropertyProviderContext = {
      tenant: context.tenant,
      principal: context.principal,
      manager: context.manager,
    };

    return {
      id: target.id,
      syncSeq: target.syncSeq,
      changeLog: this.changeLog,
      canRead: () =>
        hasPrivilege(context.manager, context.principal, target, 'read'),
      resolveHref: () =>
        resolveCollectionHref(context.manager, context.tenant, target.id),
      listMembers: async (): Promise<SyncCollectionMember[]> => {
        const children = await resourcePathResolver.listChildren(target);
        return children.map((child) => ({
          name: resourceName(child),
          resolveHref: () =>
            resolveResourceHref(context.manager, context.tenant, child),
          resolveProperties: (requested) =>
            resolveRequestedProperties(
              child,
              requested,
              this.registry,
              deadProperties,
              propertyContext,
            ),
        }));
      },
    };
  }
}
