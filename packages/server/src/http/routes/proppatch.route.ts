import {
  buildMultistatusResponse,
  DeadPropertyService,
  parseProppatchRequestBody,
  PropertyProviderRegistry,
  ResourcePathResolver,
  WebDavLiveProperties,
  type DataSource,
  type MultistatusPropertyResult,
} from '@davnode/core';
import express, { type Express, type Request } from 'express';
import { createOwnerOnlyAuthorizationMiddleware } from '../owner-only-authorization.middleware.js';
import { pathSegments, requireTenant } from './dav-path.util.js';

/**
 * Registers the PROPPATCH route for `/dav/{tenantSlug}/files{/*path}`
 * (RFC 4918 §9.2): applies a request's `set`/`remove` dead-property
 * instructions to the target `Collection`/`FileResource` and returns a
 * `207 Multi-Status` response with one `<D:propstat>` per property.
 *
 * **Atomicity, the main point of this route**: a request either
 * succeeds in full or fails in full. Every operation's property is
 * checked against `isLiveProperty` (the property-provider registry,
 * `milestones/M2-webdav-core/03-webdav-xml-property-infrastructure`)
 * *before* any database write is attempted — live properties are
 * derived from a resource's own columns and can't be modified via
 * PROPPATCH. If any operation targets one, the whole request is
 * rejected: that property gets `403 Forbidden`
 * (`cannot-modify-protected-property`), and every other property in
 * the same request gets `424 Failed Dependency` (RFC 4918's standard
 * "would have succeeded, but the request was rejected as a whole").
 * Only once every operation passes that check does
 * `DeadPropertyService.applyOperations` run, writing all of them in one
 * transaction — so a request that passes the live-property check either
 * commits completely or, on an unexpected failure, rolls back
 * completely (surfaced as a `500` by the error-handler middleware, not
 * a partial `207`).
 */
export function registerProppatchRoute(
  app: Express,
  dataSource: DataSource,
): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);
  const deadProperties = new DeadPropertyService(dataSource);
  const registry = new PropertyProviderRegistry();
  registry.register(new WebDavLiveProperties());

  app.proppatch(
    '/dav/:tenantSlug/files{/*splat}',
    express.text({ type: () => true }),
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

      const requestBody = parseProppatchRequestBody(
        typeof req.body === 'string' ? req.body : '',
      );

      const hasLivePropertyViolation = requestBody.operations.some((op) =>
        registry.isLiveProperty(op.property.namespace, op.property.name),
      );

      let results: MultistatusPropertyResult[];
      if (hasLivePropertyViolation) {
        results = requestBody.operations.map((op) => ({
          namespace: op.property.namespace,
          name: op.property.name,
          status: registry.isLiveProperty(
            op.property.namespace,
            op.property.name,
          )
            ? 403
            : 424,
        }));
      } else {
        await deadProperties.applyOperations(target, requestBody.operations);
        results = requestBody.operations.map((op) => ({
          namespace: op.property.namespace,
          name: op.property.name,
          status: 200,
        }));
      }

      res
        .status(207)
        .set('Content-Type', 'application/xml; charset=utf-8')
        .send(
          buildMultistatusResponse([{ href: req.path, properties: results }]),
        );
    },
  );
}
