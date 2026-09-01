import { IsNull, type DataSource } from 'typeorm';
import { Collection } from '../entities/collection.entity.js';
import { FileResource } from '../entities/file-resource.entity.js';

/** Either a `Collection` or a `FileResource` — whatever a path segment sequence resolves to. */
export type WebDavTreeResource = Collection | FileResource;

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
