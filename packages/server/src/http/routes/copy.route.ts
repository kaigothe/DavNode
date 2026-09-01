import {
  Collection,
  CollectionChangeService,
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
 * Registers the COPY route for `/dav/{tenantSlug}/files{/*path}` (RFC
 * 4918 §9.8): duplicates a `FileResource` or `Collection` (optionally
 * recursively) to a new location, read from the `Destination` header.
 *
 * **Authorization** is a two-resource check this route does inline
 * rather than through `createOwnerOnlyAuthorizationMiddleware` (whose
 * single-resolver design fits routes checking exactly one resource):
 * per this milestone's owner-only placeholder model, COPY needs the
 * source owned by the requesting principal (read access, simplified to
 * ownership — same simplification every other M2 route makes) *and*
 * the destination's parent collection owned by it too (write access to
 * create the copy there).
 *
 * **Tenant boundary**: `Destination` must resolve to the *same* tenant
 * as the request's own — a project-specific rule beyond RFC 4918 itself
 * (tenants are isolated mandates), rejected with `403`.
 *
 * **Depth** only matters for a `Collection` source: `0` copies just the
 * empty collection, `infinity` (or a missing header) copies the whole
 * subtree, and anything else is `400`. It's ignored entirely for a
 * `FileResource` source.
 *
 * **Destination already exists**: `Overwrite: F` (the header defaults
 * to `T`) is `412 Precondition Failed` with nothing changed; otherwise
 * the existing destination is deleted (recursively, if it's a
 * collection) and replaced, responding `204` instead of `201`.
 *
 * Every copied row is owned by the requesting principal, not the
 * source's owner — copying something makes the copier its owner, per
 * this milestone's placeholder model (RFC 3744 ACL inheritance is M3).
 * Dead properties are copied verbatim; a `FileResource` copy's ETag is
 * recomputed rather than reused (see `ResourceTreeService`). On
 * success, records one `collection_changes` entry on the destination's
 * parent — the source is untouched, so it gets none.
 */
export function registerCopyRoute(app: Express, dataSource: DataSource): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);
  const resourceTree = new ResourceTreeService();
  const collectionChanges = new CollectionChangeService();

  app.copy(
    '/dav/:tenantSlug/files{/*splat}',
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const sourceSegments = pathSegments(req);

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
        // An empty destination targets the tenant root, which always
        // exists and can't be replaced (same rationale as DELETE's
        // root protection); a destination inside the source's own
        // subtree would make the copy its own ancestor.
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

      let recursive = true;
      if (source instanceof Collection) {
        const depth = req.header('Depth');
        if (depth === '0') {
          recursive = false;
        } else if (depth !== undefined && depth !== 'infinity') {
          res.sendStatus(400);
          return;
        }
      }

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
        await resourceTree.copyRecursively(
          manager,
          source,
          destParent.id,
          destName,
          principal.id,
          recursive,
        );
        await collectionChanges.recordChange(
          manager,
          destParent.id,
          destName,
          existingTarget ? 'modified' : 'added',
        );
      });

      res.sendStatus(existingTarget ? 204 : 201);
    },
  );
}
