import { createHash } from 'node:crypto';
import {
  Collection,
  CollectionChangeService,
  createOwnerAllAce,
  FileContent,
  FileResource,
  ResourcePathResolver,
  type DataSource,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import { createAclAuthorizationMiddleware } from '../acl-authorization.middleware.js';
import {
  pathSegments,
  requirePrincipal,
  requireTenant,
} from './dav-request.util.js';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** SHA-256 of `content`, hex-encoded — deterministic, so identical content always gets the same ETag. */
function computeEtag(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Registers the PUT route for `/dav/{tenantSlug}/files{/*path}` (RFC
 * 4918 §9.7): creates a new `FileResource` or overwrites an existing
 * one's content.
 *
 * Like MKCOL, PUT never creates missing intermediate collections: a
 * missing parent is `409 Conflict`, as is a target path that already
 * exists as a `Collection` (PUT can't overwrite one). `sizeBytes` and
 * the ETag are always derived from the request body actually received
 * (`req.body.length`, a SHA-256 hash) rather than trusted from the
 * client — if a `Content-Length` header is present but disagrees with
 * the actual body length, that's a `400 Bad Request` rather than
 * silently trusting either value.
 *
 * **Conditional request**: `If-Match`, when present, is checked only
 * against an *existing* target (overwrite) — a mismatch is
 * `412 Precondition Failed` with no write, preventing a lost update
 * from concurrent writers. It's not applied to new-resource creation,
 * which this route's ACs don't exercise and RFC 4918 doesn't require.
 *
 * On success, records a `collection_changes` entry (`added` for a new
 * file, `modified` for an overwrite) and bumps the parent's `syncSeq`.
 *
 * No quota check in M2 (Quota enforcement is M8, see
 * `milestones/M2-webdav-core/00-setting-goal.md`) — this is where
 * `applyQuotaDelta` will be called once M8 exists (see
 * `milestones/M8-quota/02-webdav-quota-integration/01-put-delete-retrofit.md`).
 */
export function registerPutRoute(app: Express, dataSource: DataSource): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);
  const collectionChanges = new CollectionChangeService();

  app.put(
    '/dav/:tenantSlug/files{/*splat}',
    express.raw({ type: () => true, limit: '100mb' }),
    createAclAuthorizationMiddleware(dataSource, async (req) => {
      const tenant = requireTenant(req);
      const segments = pathSegments(req);
      if (segments.length === 0) {
        return null;
      }
      const target = await resourcePathResolver.resolve(tenant.id, segments);
      if (target) {
        return { resource: target, privilege: 'write-content' };
      }
      const parent = await resourcePathResolver.resolve(
        tenant.id,
        segments.slice(0, -1),
      );
      return parent ? { resource: parent, privilege: 'bind' } : null;
    }),
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const segments = pathSegments(req);

      if (segments.length === 0) {
        // The tenant's root collection is always a Collection.
        res.sendStatus(409);
        return;
      }

      const body: Buffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.alloc(0);
      const declaredLength = req.header('Content-Length');
      if (
        declaredLength !== undefined &&
        Number(declaredLength) !== body.length
      ) {
        res.sendStatus(400);
        return;
      }

      const newName = segments[segments.length - 1];
      const contentType = req.header('Content-Type') ?? DEFAULT_CONTENT_TYPE;
      const etag = computeEtag(body);

      const target = await resourcePathResolver.resolve(tenant.id, segments);
      if (target instanceof Collection) {
        res.sendStatus(409);
        return;
      }

      if (target instanceof FileResource) {
        const ifMatch = req.header('If-Match');
        if (ifMatch !== undefined && ifMatch !== target.etag) {
          res.sendStatus(412);
          return;
        }

        await dataSource.transaction(async (manager) => {
          const fileResources = manager.getRepository(FileResource);
          target.contentType = contentType;
          target.etag = etag;
          target.sizeBytes = body.length;
          await fileResources.save(target);

          const fileContents = manager.getRepository(FileContent);
          await fileContents.update(
            { fileResourceId: target.id },
            { data: body },
          );

          await collectionChanges.recordChange(
            manager,
            target.collectionId,
            newName,
            'modified',
          );
        });

        res.set('ETag', etag).sendStatus(204);
        return;
      }

      const parentSegments = segments.slice(0, -1);
      const parent = await resourcePathResolver.resolve(
        tenant.id,
        parentSegments,
      );
      if (!parent || !(parent instanceof Collection)) {
        res.sendStatus(409);
        return;
      }

      await dataSource.transaction(async (manager) => {
        const fileResources = manager.getRepository(FileResource);
        const created = await fileResources.save(
          fileResources.create({
            tenantId: tenant.id,
            collectionId: parent.id,
            name: newName,
            contentType,
            etag,
            sizeBytes: body.length,
            ownerPrincipalId: principal.id,
          }),
        );

        const fileContents = manager.getRepository(FileContent);
        await fileContents.save(
          fileContents.create({ fileResourceId: created.id, data: body }),
        );

        await createOwnerAllAce(manager, 'file', created.id, principal.id);

        await collectionChanges.recordChange(
          manager,
          parent.id,
          newName,
          'added',
        );
      });

      res.set('ETag', etag).sendStatus(201);
    },
  );
}
