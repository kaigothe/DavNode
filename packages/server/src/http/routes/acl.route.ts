import {
  type AceLike,
  type AclRequestAce,
  buildErrorResponse,
  Collection,
  CollectionAce,
  type DataSource,
  FileAce,
  type GrantDeny,
  hasPrivilege,
  parseAclRequestBody,
  parsePrincipalUrl,
  Principal,
  type Privilege,
  ResourcePathResolver,
} from '@davnode/core';
import express, { type Express, type Request, type Response } from 'express';
import { pathSegments, requirePrincipal, requireTenant } from './dav-request.util.js';

/** One request ACE, fully resolved to a real principal id and a single privilege — the unit `CollectionAce`/`FileAce` rows are created from. */
interface ResolvedAce {
  principalId: string;
  grantDeny: GrantDeny;
  privilege: Privilege;
}

/** Sends a `403 Forbidden` with an RFC 4918 §16 `<D:error>` body naming `condition`. */
function sendAclError(res: Response, condition: string): void {
  res
    .status(403)
    .set('Content-Type', 'application/xml; charset=utf-8')
    .send(buildErrorResponse([condition]));
}

/**
 * The `position` the first newly-inserted ACE should get: right after
 * every existing `protected` ACE's own position (those are never
 * touched by `ACL`, so their positions must stay reserved), or `0` if
 * there are none.
 */
function nextPosition(protectedAces: readonly AceLike[]): number {
  if (protectedAces.length === 0) {
    return 0;
  }
  return Math.max(...protectedAces.map((ace) => ace.position)) + 1;
}

/**
 * Whether `resolvedAces` would conflictingly modify any of `existing`'s
 * `protected` ACEs — RFC 3744 §8.1.1's `DAV:no-protected-ace-conflict`:
 * an incoming ACE for the same principal as a protected one, but with a
 * different privilege or grant/deny value.
 */
function conflictsWithProtectedAces(
  existing: readonly AceLike[],
  resolvedAces: readonly ResolvedAce[],
): boolean {
  const protectedAces = existing.filter((ace) => ace.protected);
  return protectedAces.some((protectedAce) =>
    resolvedAces.some(
      (ace) =>
        ace.principalId === protectedAce.principalId &&
        (ace.privilege !== protectedAce.privilege ||
          ace.grantDeny !== protectedAce.grantDeny),
    ),
  );
}

/**
 * Registers the `ACL` route for `/dav/{tenantSlug}/files{/*path}` (RFC
 * 3744 §8.1): replaces a resource's non-protected, non-inherited ACEs
 * with the complete list from the request body.
 *
 * **Authorization**: requires `write-acl` on the target resource itself
 * (via `hasPrivilege` — the real ACL-evaluation engine, not the M2
 * owner-only placeholder, since granting/revoking rights is exactly what
 * this method exists to gate more precisely than plain ownership).
 *
 * **Request-body rules** (RFC 3744 §8.1/§9.2), each rejecting the whole
 * request with `403` and a `<D:error>` body naming the failed condition
 * — nothing is written for any of them:
 * - An `<D:ace>` whose `<D:principal>` doesn't resolve to a real,
 *   same-tenant `Principal` row (unknown id, foreign-tenant URL, or an
 *   unsupported principal form) → `DAV:recognized-principal`.
 * - An `<D:ace>` carrying a `<D:inherited>` element — inheritance is
 *   metadata the server reports, not something a client can assert —
 *   → `DAV:no-ace-conflict` (RFC 3744's own catch-all for an
 *   implementation-specific restriction; no dedicated condition exists
 *   for this exact case).
 * - An ACE that would conflictingly modify a `protected` ACE (e.g. the
 *   default-owner ACE from `createOwnerAllAce`) →
 *   `DAV:no-protected-ace-conflict`.
 *
 * **Replacement**: every existing non-`protected` direct ACE on the
 * resource is deleted and the request's ACEs are inserted in its place,
 * `position`ed to start right after the highest-positioned `protected`
 * ACE (see {@link nextPosition}) — `protected` ACEs are never touched.
 * One request `<D:ace>` naming several privileges becomes one stored row
 * per privilege (the schema is one-privilege-per-row). Runs in a single
 * transaction, once the conflict/recognized-principal checks (both
 * plain reads beforehand) have already passed.
 *
 * Success: `200 OK`, no response body required.
 */
export function registerAclRoute(app: Express, dataSource: DataSource): void {
  const resourcePathResolver = new ResourcePathResolver(dataSource);

  app.acl(
    '/dav/:tenantSlug/files{/*splat}',
    express.text({ type: () => true }),
    async (req: Request, res: Response): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const segments = pathSegments(req);

      const target = await resourcePathResolver.resolve(tenant.id, segments);
      if (!target) {
        res.sendStatus(404);
        return;
      }

      const allowed = await dataSource.manager.transaction((manager) =>
        hasPrivilege(manager, principal, target, 'write-acl'),
      );
      if (!allowed) {
        res.sendStatus(403);
        return;
      }

      let requestAces: AclRequestAce[];
      try {
        requestAces = parseAclRequestBody(
          typeof req.body === 'string' ? req.body : '',
        ).aces;
      } catch {
        res.sendStatus(400);
        return;
      }

      if (requestAces.some((ace) => ace.inherited)) {
        sendAclError(res, 'no-ace-conflict');
        return;
      }

      const resolvedAces: ResolvedAce[] = [];
      for (const requestAce of requestAces) {
        const parsedUrl = requestAce.principalUrl
          ? parsePrincipalUrl(requestAce.principalUrl)
          : null;
        const principalRow =
          parsedUrl && parsedUrl.tenantSlug === tenant.slug
            ? await dataSource
                .getRepository(Principal)
                .findOneBy({ id: parsedUrl.id, tenantId: tenant.id })
            : null;
        if (!principalRow) {
          sendAclError(res, 'recognized-principal');
          return;
        }
        for (const privilege of requestAce.privileges) {
          resolvedAces.push({
            principalId: principalRow.id,
            grantDeny: requestAce.grantDeny,
            privilege,
          });
        }
      }

      if (target instanceof Collection) {
        const repository = dataSource.getRepository(CollectionAce);
        const existing = await repository.findBy({ collectionId: target.id });
        if (conflictsWithProtectedAces(existing, resolvedAces)) {
          sendAclError(res, 'no-protected-ace-conflict');
          return;
        }

        const startPosition = nextPosition(
          existing.filter((ace) => ace.protected),
        );
        await dataSource.transaction(async (manager) => {
          const txRepository = manager.getRepository(CollectionAce);
          await txRepository.delete({
            collectionId: target.id,
            protected: false,
          });
          let position = startPosition;
          for (const resolvedAce of resolvedAces) {
            await txRepository.save(
              txRepository.create({
                collectionId: target.id,
                principalId: resolvedAce.principalId,
                privilege: resolvedAce.privilege,
                grantDeny: resolvedAce.grantDeny,
                protected: false,
                position: position++,
              }),
            );
          }
        });
      } else {
        const repository = dataSource.getRepository(FileAce);
        const existing = await repository.findBy({ fileResourceId: target.id });
        if (conflictsWithProtectedAces(existing, resolvedAces)) {
          sendAclError(res, 'no-protected-ace-conflict');
          return;
        }

        const startPosition = nextPosition(
          existing.filter((ace) => ace.protected),
        );
        await dataSource.transaction(async (manager) => {
          const txRepository = manager.getRepository(FileAce);
          await txRepository.delete({
            fileResourceId: target.id,
            protected: false,
          });
          let position = startPosition;
          for (const resolvedAce of resolvedAces) {
            await txRepository.save(
              txRepository.create({
                fileResourceId: target.id,
                principalId: resolvedAce.principalId,
                privilege: resolvedAce.privilege,
                grantDeny: resolvedAce.grantDeny,
                protected: false,
                position: position++,
              }),
            );
          }
        });
      }

      res.sendStatus(200);
    },
  );
}
