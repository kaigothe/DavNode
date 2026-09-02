import { IsNull, type DataSource, type EntityManager } from 'typeorm';
import { Collection } from '../entities/collection.entity.js';
import { FileResource } from '../entities/file-resource.entity.js';
import type { Tenant } from '../entities/tenant.entity.js';

/** Either a `Collection` or a `FileResource` — whatever a path segment sequence resolves to. */
export type WebDavTreeResource = Collection | FileResource;

/**
 * Resolves `collectionId`'s own DAV href by walking its
 * `parentCollectionId` chain up to the tenant root and joining the
 * collected `displayName`s — the reverse of {@link ResourcePathResolver.resolve}
 * (which goes href → resource, not resource → href). A plain function
 * rather than a `ResourcePathResolver` method since its callers (live
 * property providers) are handed a per-request `EntityManager`, not a
 * `DataSource` to construct a resolver instance from.
 *
 * Originally written for `DAV:acl`'s `<D:inherited><D:href>...</D:href></D:inherited>`
 * (RFC 3744 §5.5, naming the ancestor collection an inherited ACE came
 * from) and shared as-is for `DAV:lockdiscovery`'s `<D:lockroot>` (RFC
 * 4918 §14.12, naming the ancestor collection an inherited lock sits
 * on) — both need exactly the same resource-id-to-href resolution.
 */
export async function resolveCollectionHref(
  manager: EntityManager,
  tenant: Tenant,
  collectionId: string,
): Promise<string> {
  const collections = manager.getRepository(Collection);
  const segments: string[] = [];
  let current = await collections.findOneByOrFail({ id: collectionId });
  while (current.parentCollectionId !== null) {
    segments.unshift(current.displayName);
    current = await collections.findOneByOrFail({
      id: current.parentCollectionId,
    });
  }
  const suffix = segments.map(encodeURIComponent).join('/');
  return `/dav/${tenant.slug}/files${suffix ? `/${suffix}` : ''}`;
}

/**
 * Resolves any {@link WebDavTreeResource}'s own DAV href — a
 * `FileResource` extends {@link resolveCollectionHref}'s result for its
 * own parent collection with its own `name` segment; a `Collection`
 * delegates to it directly.
 */
export async function resolveResourceHref(
  manager: EntityManager,
  tenant: Tenant,
  resource: WebDavTreeResource,
): Promise<string> {
  if (resource instanceof Collection) {
    return resolveCollectionHref(manager, tenant, resource.id);
  }
  const parentHref = await resolveCollectionHref(
    manager,
    tenant,
    resource.collectionId,
  );
  return `${parentHref.replace(/\/$/, '')}/${encodeURIComponent(resource.name)}`;
}

/**
 * Resolves `/dav/{tenant}/files/...` paths (RFC 4918's URL-addressed
 * resources) to the `Collection`/`FileResource` row they name, by
 * walking the tenant's file tree one path segment at a time.
 *
 * There's no separate "path segment" column on either entity — a
 * segment matches a `Collection` by `displayName` or a `FileResource`
 * by `name` (see `planning/05-data-model.md`'s WebDAV-Domäne section),
 * both scoped to the current segment's parent collection.
 */
export class ResourcePathResolver {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Resolves `segments` (path components after `/files/`, in order,
   * with no leading/trailing empty strings) within `tenantId`'s file
   * tree.
   *
   * @returns The resolved `Collection` or `FileResource`, or `null` if
   * any segment along the way — including the last — doesn't exist.
   * An empty `segments` array resolves to the tenant's root collection.
   */
  async resolve(
    tenantId: string,
    segments: readonly string[],
  ): Promise<WebDavTreeResource | null> {
    const collections = this.dataSource.getRepository(Collection);

    let current = await collections.findOneBy({
      tenantId,
      parentCollectionId: IsNull(),
    });
    if (!current) {
      return null;
    }

    for (const [i, segment] of segments.entries()) {
      const isLastSegment = i === segments.length - 1;

      const childCollection = await collections.findOneBy({
        tenantId,
        parentCollectionId: current.id,
        displayName: segment,
      });
      if (childCollection) {
        current = childCollection;
        continue;
      }

      if (isLastSegment) {
        return this.dataSource.getRepository(FileResource).findOneBy({
          tenantId,
          collectionId: current.id,
          name: segment,
        });
      }

      return null;
    }

    return current;
  }

  /**
   * Lists `collection`'s direct children — both sub-collections and
   * file resources — for `Depth: 1` PROPFIND responses (RFC 4918
   * §9.1). Order between the two kinds is unspecified.
   */
  async listChildren(collection: Collection): Promise<WebDavTreeResource[]> {
    const [childCollections, childFiles] = await Promise.all([
      this.dataSource.getRepository(Collection).findBy({
        parentCollectionId: collection.id,
      }),
      this.dataSource.getRepository(FileResource).findBy({
        collectionId: collection.id,
      }),
    ]);
    return [...childCollections, ...childFiles];
  }
}
