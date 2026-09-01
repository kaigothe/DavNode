import {
  Collection,
  CollectionChange,
  CollectionChangeService,
  CollectionProperty,
  FileProperty,
  FileResource,
  ResourcePathResolver,
  type DataSource,
} from '@davnode/core';
import type { EntityManager } from 'typeorm';
import type { Express, Request } from 'express';
import { createOwnerOnlyAuthorizationMiddleware } from '../owner-only-authorization.middleware.js';
import { pathSegments, requireTenant } from './dav-request.util.js';

/**
 * Deletes `collection` and every descendant beneath it (sub-collections,
 * `FileResource`s, their `FileContent` — which cascades at the DB level
 * — and every `*_properties`/`collection_changes` row that references
 * them). Children are removed depth-first so no foreign key from a
 * still-present row ever points at an already-deleted one; none of
 * these tables cascade at the DB level except `FileContent`
 * (`file-content.entity.ts`), so this ordering is the only thing
 * preventing a constraint violation partway through.
 */
async function deleteRecursively(
  manager: EntityManager,
  collection: Collection,
): Promise<void> {
  const children = await manager
    .getRepository(Collection)
    .findBy({ parentCollectionId: collection.id });
  for (const child of children) {
    await deleteRecursively(manager, child);
  }

  const files = await manager
    .getRepository(FileResource)
    .findBy({ collectionId: collection.id });
  for (const file of files) {
    await manager
      .getRepository(FileProperty)
      .delete({ fileResourceId: file.id });
    await manager.getRepository(FileResource).delete({ id: file.id });
  }

  await manager
    .getRepository(CollectionProperty)
    .delete({ collectionId: collection.id });
  await manager
    .getRepository(CollectionChange)
    .delete({ collectionId: collection.id });
  await manager.getRepository(Collection).delete({ id: collection.id });
}

/**
 * Registers the DELETE route for `/dav/{tenantSlug}/files{/*path}`:
 * deletes a `FileResource`, or a `Collection` together with its entire
 * subtree.
 *
 * A tenant's root collection (`parentCollectionId === null`) can't be
 * deleted — doing so would leave the tenant with no WebDAV entry point
 * at all — and is rejected with `403 Forbidden` rather than `405`,
 * since no *other* target would ever make this request valid either.
 *
 * On success, records exactly **one** `collection_changes` entry
 * (`deleted`) on the target's direct parent and bumps its `syncSeq` —
 * even for a recursively-deleted collection with many descendants, per
 * `milestones/M2-webdav-core/06-resource-crud/04-delete.md`: the
 * descendants no longer exist as independent resources for sync
 * purposes once their own subtree is gone.
 */
export function registerDeleteRoute(
  app: Express,
  dataSource: DataSource,
): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);
  const collectionChanges = new CollectionChangeService();

  app.delete(
    '/dav/:tenantSlug/files{/*splat}',
    createOwnerOnlyAuthorizationMiddleware((req) =>
      resourcePathResolver.resolve(requireTenant(req).id, pathSegments(req)),
    ),
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const segments = pathSegments(req);
      const target = await resourcePathResolver.resolve(tenant.id, segments);
      if (!target) {
        res.sendStatus(404);
        return;
      }

      if (target instanceof Collection) {
        if (target.parentCollectionId === null) {
          res.sendStatus(403);
          return;
        }

        const parentId = target.parentCollectionId;
        const name = target.displayName;
        await dataSource.transaction(async (manager) => {
          await deleteRecursively(manager, target);
          await collectionChanges.recordChange(
            manager,
            parentId,
            name,
            'deleted',
          );
        });
      } else {
        const parentId = target.collectionId;
        const name = target.name;
        await dataSource.transaction(async (manager) => {
          await manager
            .getRepository(FileProperty)
            .delete({ fileResourceId: target.id });
          await manager.getRepository(FileResource).delete({ id: target.id });
          await collectionChanges.recordChange(
            manager,
            parentId,
            name,
            'deleted',
          );
        });
      }

      res.sendStatus(204);
    },
  );
}
