import {
  Collection,
  CollectionChangeService,
  ResourcePathResolver,
  ResourceTreeService,
  type DataSource,
} from '@davnode/core';
import type { Express, Request } from 'express';
import { createAclAuthorizationMiddleware } from '../acl-authorization.middleware.js';
import {
  pathSegments,
  requireTenant,
  resolveParentCollection,
} from './dav-request.util.js';

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
  const resourceTree = new ResourceTreeService();
  const collectionChanges = new CollectionChangeService();

  app.delete(
    '/dav/:tenantSlug/files{/*splat}',
    createAclAuthorizationMiddleware(dataSource, async (req) => {
      const target = await resourcePathResolver.resolve(
        requireTenant(req).id,
        pathSegments(req),
      );
      if (!target) {
        return null;
      }
      // The tenant root has no parent (resolveParentCollection returns
      // null); the handler already forbids deleting it (403) regardless
      // of privilege, so no check is needed here in that case either.
      const parent = await resolveParentCollection(dataSource, target);
      return parent ? { resource: parent, privilege: 'unbind' } : null;
    }),
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const segments = pathSegments(req);
      const target = await resourcePathResolver.resolve(tenant.id, segments);
      if (!target) {
        res.sendStatus(404);
        return;
      }

      if (target instanceof Collection && target.parentCollectionId === null) {
        res.sendStatus(403);
        return;
      }

      const parentId =
        target instanceof Collection
          ? target.parentCollectionId!
          : target.collectionId;
      const name =
        target instanceof Collection ? target.displayName : target.name;

      await dataSource.transaction(async (manager) => {
        await resourceTree.deleteRecursively(manager, target);
        await collectionChanges.recordChange(
          manager,
          parentId,
          name,
          'deleted',
        );
      });

      res.sendStatus(204);
    },
  );
}
