import { createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { Collection } from '../entities/collection.entity.js';
import { CollectionChange } from '../entities/collection-change.entity.js';
import { CollectionProperty } from '../entities/collection-property.entity.js';
import { FileContent } from '../entities/file-content.entity.js';
import { FileProperty } from '../entities/file-property.entity.js';
import { FileResource } from '../entities/file-resource.entity.js';
import type { WebDavTreeResource } from './resource-path-resolver.js';

/** SHA-256 of `content`, hex-encoded — the same deterministic scheme PUT uses for `FileResource.etag`. */
function computeEtag(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Deletes and duplicates whole `Collection`/`FileResource` subtrees —
 * the shared mechanics behind DELETE (`06-resource-crud`) and COPY/MOVE's
 * `Overwrite: T` replacement step (`07-copy-move`). Every method takes
 * the caller's own `EntityManager` rather than opening a transaction
 * itself, so a multi-step operation (e.g. "delete the existing
 * destination, then copy the source into its place") commits or rolls
 * back as one unit.
 */
export class ResourceTreeService {
  /**
   * Deletes `resource` and, for a `Collection`, every descendant beneath
   * it (sub-collections, `FileResource`s, their `FileContent` — which
   * cascades at the DB level — and every `*_properties`/
   * `collection_changes` row that references them). Children are
   * removed depth-first so no foreign key from a still-present row ever
   * points at an already-deleted one; none of these tables cascade at
   * the DB level except `FileContent`, so this ordering is the only
   * thing preventing a constraint violation partway through.
   */
  async deleteRecursively(
    manager: EntityManager,
    resource: WebDavTreeResource,
  ): Promise<void> {
    if (resource instanceof Collection) {
      const children = await manager
        .getRepository(Collection)
        .findBy({ parentCollectionId: resource.id });
      for (const child of children) {
        await this.deleteRecursively(manager, child);
      }

      const files = await manager
        .getRepository(FileResource)
        .findBy({ collectionId: resource.id });
      for (const file of files) {
        await this.deleteRecursively(manager, file);
      }

      await manager
        .getRepository(CollectionProperty)
        .delete({ collectionId: resource.id });
      await manager
        .getRepository(CollectionChange)
        .delete({ collectionId: resource.id });
      await manager.getRepository(Collection).delete({ id: resource.id });
    } else {
      await manager
        .getRepository(FileProperty)
        .delete({ fileResourceId: resource.id });
      // FileContent cascades at the DB level (file-content.entity.ts).
      await manager.getRepository(FileResource).delete({ id: resource.id });
    }
  }

  /**
   * Copies `source` (and, for a `Collection` with `recursive: true`,
   * every descendant) to a new location: `destParentCollectionId` with
   * path segment `destName`. Dead properties are copied verbatim; a
   * `FileResource` copy's `etag` is recomputed from its (unchanged)
   * content rather than reusing the source's stored value — RFC 4918
   * doesn't require an ETag to be portable across resources, and
   * recomputing keeps this consistent with how PUT derives one, even
   * though identical content naturally still hashes to the same value.
   * Every copied row is owned by `ownerPrincipalId` (the requesting
   * principal, not the source's owner — COPY's owner-only placeholder
   * model treats "whoever copies it" as the new owner).
   *
   * `recursive: false` on a `Collection` copies only the empty
   * collection itself (RFC 4918 §9.8's `Depth: 0`), ignored for a
   * `FileResource` (Depth is meaningless there).
   */
  async copyRecursively(
    manager: EntityManager,
    source: WebDavTreeResource,
    destParentCollectionId: string,
    destName: string,
    ownerPrincipalId: string,
    recursive: boolean,
  ): Promise<WebDavTreeResource> {
    if (source instanceof Collection) {
      const collections = manager.getRepository(Collection);
      const copy = await collections.save(
        collections.create({
          tenantId: source.tenantId,
          parentCollectionId: destParentCollectionId,
          ownerPrincipalId,
          displayName: destName,
        }),
      );

      const properties = await manager
        .getRepository(CollectionProperty)
        .findBy({ collectionId: source.id });
      for (const property of properties) {
        const repository = manager.getRepository(CollectionProperty);
        await repository.save(
          repository.create({
            collectionId: copy.id,
            namespace: property.namespace,
            name: property.name,
            value: property.value,
          }),
        );
      }

      if (recursive) {
        const childCollections = await collections.findBy({
          parentCollectionId: source.id,
        });
        for (const child of childCollections) {
          await this.copyRecursively(
            manager,
            child,
            copy.id,
            child.displayName,
            ownerPrincipalId,
            true,
          );
        }

        const childFiles = await manager
          .getRepository(FileResource)
          .findBy({ collectionId: source.id });
        for (const child of childFiles) {
          await this.copyRecursively(
            manager,
            child,
            copy.id,
            child.name,
            ownerPrincipalId,
            true,
          );
        }
      }

      return copy;
    }

    const sourceContent = await manager
      .getRepository(FileContent)
      .findOneByOrFail({ fileResourceId: source.id });

    const fileResources = manager.getRepository(FileResource);
    const copy = await fileResources.save(
      fileResources.create({
        tenantId: source.tenantId,
        collectionId: destParentCollectionId,
        name: destName,
        contentType: source.contentType,
        etag: computeEtag(sourceContent.data),
        sizeBytes: source.sizeBytes,
        ownerPrincipalId,
      }),
    );

    const fileContents = manager.getRepository(FileContent);
    await fileContents.save(
      fileContents.create({
        fileResourceId: copy.id,
        data: sourceContent.data,
      }),
    );

    const properties = await manager
      .getRepository(FileProperty)
      .findBy({ fileResourceId: source.id });
    for (const property of properties) {
      const repository = manager.getRepository(FileProperty);
      await repository.save(
        repository.create({
          fileResourceId: copy.id,
          namespace: property.namespace,
          name: property.name,
          value: property.value,
        }),
      );
    }

    return copy;
  }
}
