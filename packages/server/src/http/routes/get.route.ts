import {
  Collection,
  FileContent,
  ResourcePathResolver,
  type DataSource,
} from '@davnode/core';
import type { Express, Request } from 'express';
import { createOwnerOnlyAuthorizationMiddleware } from '../owner-only-authorization.middleware.js';
import { pathSegments, requireTenant } from './dav-request.util.js';

/**
 * Whether `headerValue` (an `If-None-Match` header, possibly a
 * comma-separated list, per RFC 7232 §3.2) matches `etag`. `*` matches
 * any existing resource. Weak validators (`W/"..."`) are compared using
 * their opaque tag, ignoring the weakness indicator — RFC 7232 requires
 * only weak comparison for GET's conditional semantics anyway.
 */
function ifNoneMatchMatches(headerValue: string, etag: string): boolean {
  if (headerValue.trim() === '*') {
    return true;
  }
  return headerValue
    .split(',')
    .some((candidate) => candidate.trim().replace(/^W\//, '') === etag);
}

/**
 * Registers the GET route for `/dav/{tenantSlug}/files{/*path}`: returns
 * a `FileResource`'s content and metadata (`Content-Type`,
 * `Content-Length`, `ETag`).
 *
 * WebDAV doesn't define GET on a collection; this server returns `405`
 * rather than a directory listing — PROPFIND is the spec-correct way to
 * enumerate a collection's children.
 *
 * **Conditional request**: an `If-None-Match` header matching the
 * resource's current ETag short-circuits to `304 Not Modified` with no
 * body — checked against `FileResource.etag` (already loaded while
 * resolving the target path) *before* `FileContent`'s blob is ever
 * queried, so a client that already has the current version never pays
 * for loading it from the database.
 */
export function registerGetRoute(app: Express, dataSource: DataSource): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);

  app.get(
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
        res.sendStatus(405);
        return;
      }

      const ifNoneMatch = req.header('If-None-Match');
      if (
        ifNoneMatch !== undefined &&
        ifNoneMatchMatches(ifNoneMatch, target.etag)
      ) {
        res.set('ETag', target.etag).sendStatus(304);
        return;
      }

      const content = await dataSource
        .getRepository(FileContent)
        .findOneByOrFail({ fileResourceId: target.id });

      res
        .status(200)
        .set('Content-Type', target.contentType)
        .set('Content-Length', String(target.sizeBytes))
        .set('ETag', target.etag)
        .send(Buffer.from(content.data));
    },
  );
}
