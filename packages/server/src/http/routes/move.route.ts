import {
  Collection,
  CollectionChangeService,
  FileResource,
  ResourcePathResolver,
  ResourceTreeService,
  type DataSource,
} from '@davnode/core';
import type { Express, Request } from 'express';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from './dav-request.util.js';
import {
  isDestinationWithinSource,
  parseDestinationHeader,
  parseOverwriteHeader,
} from './copy-move.util.js';

/**
 * Registers the MOVE route for `/dav/{tenantSlug}/files{/*path}` (RFC
 * 4918 §9.9): relocates a `FileResource` or `Collection` (with its
 * entire subtree) to a new location, read from the `Destination`
 * header. Shares `Destination`/`Overwrite` parsing, the tenant-boundary
 * rule, and the two-resource ownership check with `copy.route.ts` (see
 * there for why that check is inline rather than through
 * `createOwnerOnlyAuthorizationMiddleware`) — the differences from COPY
 * are the ones that matter:
 *
 * - **Depth**: RFC 4918 §9.9.3 requires a MOVE on a collection to act
 *   as `Depth: infinity`; the only header value a client may send is
 *   `infinity` itself (a missing header is the same as sending it).
 *   Anything else — most notably `0` — is `400 Bad Request`.
 * - **Identity, not a fresh copy**: the moved resource keeps its
 *   `ownerPrincipalId`, `id`, and `createdAt` — it's the same resource,
 *   just relocated. Internally this is a single `UPDATE` of the moved
 *   row's parent/name (`parentCollectionId`+`displayName` for a
 *   `Collection`, `collectionId`+`name` for a `FileResource`), not a
 *   copy-then-delete: a `Collection`'s descendants reference *it* by
 *   id, not by path, so relocating the top-level row moves the whole
 *   subtree without touching a single descendant row.
 * - **Two `collection_changes` entries**: one `deleted` on the source's
 *   *old* parent and one `added` on the destination's parent — even
 *   when both happen to be the same collection (a same-directory
 *   rename), since a `sync-collection` client watching that collection
 *   sees the old href disappear and the new one appear, exactly like
 *   an unrelated delete and add would look.
 *
 * `Overwrite: F` against an existing destination is still
 * `412 Precondition Failed` with nothing changed; `Overwrite: T` (the
 * default) deletes the existing destination first — via
 * `ResourceTreeService.deleteRecursively`, recursively if it's a
 * collection — before relocating the source into its place, since the
 * source's new name/parent could otherwise collide with what it's
 * replacing.
 */
export function registerMoveRoute(app: Express, dataSource: DataSource): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);
  const resourceTree = new ResourceTreeService();
  const collectionChanges = new CollectionChangeService();

  app.move(
    '/dav/:tenantSlug/files{/*splat}',
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const sourceSegments = pathSegments(req);

      const depth = req.header('Depth');
      if (depth !== undefined && depth !== 'infinity') {
        res.sendStatus(400);
        return;
      }

      const destination = parseDestinationHeader(req.header('Destination'));
      if (!destination) {
        res.sendStatus(400);
        return;
      }
      if (destination.tenantSlug !== tenant.slug) {
        res.sendStatus(403);
        return;
      }
      const destSegments = destination.segments;

      if (
        destSegments.length === 0 ||
        isDestinationWithinSource(sourceSegments, destSegments)
      ) {
        res.sendStatus(409);
        return;
      }

      const source = await resourcePathResolver.resolve(
        tenant.id,
        sourceSegments,
      );
      if (!source) {
        res.sendStatus(404);
        return;
      }
      if (source.ownerPrincipalId !== principal.id) {
        res.sendStatus(403);
        return;
      }

      const sourceParentId =
        source instanceof Collection
          ? source.parentCollectionId
          : source.collectionId;
      if (sourceParentId === null) {
        // The tenant root has no parent to move it out of — same
        // rationale as DELETE's root protection.
        res.sendStatus(403);
        return;
      }
      const sourceName =
        source instanceof Collection ? source.displayName : source.name;

      const destParent = await resourcePathResolver.resolve(
        tenant.id,
        destSegments.slice(0, -1),
      );
      if (!destParent || !(destParent instanceof Collection)) {
        res.sendStatus(409);
        return;
      }
      if (destParent.ownerPrincipalId !== principal.id) {
        res.sendStatus(403);
        return;
      }

      const destName = destSegments[destSegments.length - 1];
      const existingTarget = await resourcePathResolver.resolve(
        tenant.id,
        destSegments,
      );
      const overwrite = parseOverwriteHeader(req.header('Overwrite'));
      if (existingTarget && !overwrite) {
        res.sendStatus(412);
        return;
      }

      await dataSource.transaction(async (manager) => {
        if (existingTarget) {
          await resourceTree.deleteRecursively(manager, existingTarget);
        }

        if (source instanceof Collection) {
          await manager
            .getRepository(Collection)
            .update(
              { id: source.id },
              { parentCollectionId: destParent.id, displayName: destName },
            );
        } else {
          await manager
            .getRepository(FileResource)
            .update(
              { id: source.id },
              { collectionId: destParent.id, name: destName },
            );
        }

        await collectionChanges.recordChange(
          manager,
          sourceParentId,
          sourceName,
          'deleted',
        );
        await collectionChanges.recordChange(
          manager,
          destParent.id,
          destName,
          'added',
        );
      });

      res.sendStatus(existingTarget ? 204 : 201);
    },
  );
}
