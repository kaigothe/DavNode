import {
  Collection,
  CollectionChangeService,
  ResourcePathResolver,
  type DataSource,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import { createOwnerOnlyAuthorizationMiddleware } from '../owner-only-authorization.middleware.js';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from './dav-request.util.js';

/**
 * Registers the MKCOL route for `/dav/{tenantSlug}/files{/*path}` (RFC
 * 4918 §9.3): creates a new `Collection` at the target path.
 *
 * MKCOL never creates missing intermediate collections (RFC 4918
 * §9.3): if the target's parent doesn't already exist, the request
 * fails with `409 Conflict` rather than silently creating it. If the
 * target path already exists — as either a `Collection` or a
 * `FileResource` — the request fails with `405 Method Not Allowed`
 * (MKCOL can't overwrite anything).
 *
 * A request body MKCOL doesn't understand — anything at all, since
 * Extended MKCOL (RFC 5689, used by M5's CardDAV addressbook creation)
 * isn't supported yet — is rejected with `415 Unsupported Media Type`
 * per RFC 4918 §9.3.1.
 *
 * On success, records a `collection_changes` entry and bumps the
 * parent's `syncSeq` (`CollectionChangeService`,
 * `milestones/M2-webdav-core/06-resource-crud`).
 */
export function registerMkcolRoute(app: Express, dataSource: DataSource): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);
  const collectionChanges = new CollectionChangeService();

  app.mkcol(
    '/dav/:tenantSlug/files{/*splat}',
    express.text({ type: () => true }),
    createOwnerOnlyAuthorizationMiddleware(async (req) => {
      const tenant = requireTenant(req);
      const segments = pathSegments(req);
      if (segments.length === 0) {
        return null;
      }
      return resourcePathResolver.resolve(tenant.id, segments.slice(0, -1));
    }),
    async (req: Request, res): Promise<void> => {
      if (typeof req.body === 'string' && req.body.trim() !== '') {
        res.sendStatus(415);
        return;
      }

      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const segments = pathSegments(req);

      if (segments.length === 0) {
        // The tenant's root collection always exists already.
        res.sendStatus(405);
        return;
      }

      const newName = segments[segments.length - 1];
      const parentSegments = segments.slice(0, -1);

      const parent = await resourcePathResolver.resolve(
        tenant.id,
        parentSegments,
      );
      if (!parent || !(parent instanceof Collection)) {
        res.sendStatus(409);
        return;
      }

      const existing = await resourcePathResolver.resolve(tenant.id, segments);
      if (existing) {
        res.sendStatus(405);
        return;
      }

      await dataSource.transaction(async (manager) => {
        const collections = manager.getRepository(Collection);
        await collections.save(
          collections.create({
            tenantId: tenant.id,
            parentCollectionId: parent.id,
            ownerPrincipalId: principal.id,
            displayName: newName,
          }),
        );
        await collectionChanges.recordChange(
          manager,
          parent.id,
          newName,
          'added',
        );
      });

      res.sendStatus(201);
    },
  );
}
