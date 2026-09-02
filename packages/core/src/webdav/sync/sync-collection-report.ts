import { MoreThan } from 'typeorm';
import { hasPrivilege } from '../../acl/evaluate-privilege.js';
import { AclPropertiesProvider } from '../../acl/acl-properties-provider.js';
import { Collection } from '../../entities/collection.entity.js';
import {
  CollectionChange,
  type CollectionChangeAction,
} from '../../entities/collection-change.entity.js';
import { LockPropertiesProvider } from '../locking/lock-properties-provider.js';
import { DeadPropertyService } from '../properties/dead-property.service.js';
import { PropertyProviderRegistry } from '../properties/property-provider-registry.js';
import type {
  PropertyProviderContext,
  PropertyValue,
  WebDavResource,
} from '../properties/property-provider.interface.js';
import { WebDavLiveProperties } from '../properties/webdav-live-properties.js';
import type { ReportContext, ReportHandler, ReportResult } from '../report-registry.js';
import {
  ResourcePathResolver,
  resolveCollectionHref,
  resolveResourceHref,
  type WebDavTreeResource,
} from '../resource-path-resolver.js';
import { buildErrorResponse } from '../xml/error-response-builder.js';
import {
  buildMultistatusResponse,
  type MultistatusPropertyResult,
  type MultistatusResourceResult,
} from '../xml/multistatus-builder.js';
import type { PropertyName } from '../xml/request-parser.js';
import { parseSyncCollectionRequestBody } from './sync-collection-request-parser.js';
import { encodeSyncToken } from './sync-token.js';
import { validateSyncToken } from './validate-sync-token.js';

/** `child`'s own path segment: a `Collection`'s `displayName`, or a `FileResource`'s `name`. */
function resourceName(resource: WebDavTreeResource): string {
  return resource instanceof Collection ? resource.displayName : resource.name;
}

/**
 * Resolves `requested` against `resource`'s combined live + dead
 * properties — conceptually the same "found → 200, not found → 404"
 * lookup PROPFIND's own `prop`-mode request uses
 * (`packages/server/src/http/routes/propfind.route.ts`), reimplemented
 * here rather than shared: this report only ever needs that one mode
 * (RFC 6578 §6.1's `<D:prop>` has no `allprop`/`propname` equivalent),
 * and PROPFIND's version is server-package-private, not something a
 * `@davnode/core` report handler can import.
 */
async function resolveRequestedProperties(
  resource: WebDavResource,
  requested: readonly PropertyName[],
  registry: PropertyProviderRegistry<WebDavResource>,
  deadProperties: DeadPropertyService,
  context: PropertyProviderContext,
): Promise<MultistatusPropertyResult[]> {
  const live = await registry.listLiveProperties(resource, context);
  const dead =
    resource instanceof Collection
      ? await deadProperties.listForCollection(resource.id)
      : await deadProperties.listForFileResource(resource.id);
  const all: PropertyValue[] = [...live, ...dead];

  return requested.map((request) => {
    const found = all.find(
      (p) => p.namespace === request.namespace && p.name === request.name,
    );
    return found ? { ...found, status: 200 } : { ...request, status: 404 };
  });
}

/**
 * Handles the `{DAV:}sync-collection` REPORT (RFC 6578) — registered
 * into the generic REPORT dispatcher (M3,
 * `milestones/M3-webdav-acl/06-principals-and-report-infrastructure/02-generic-report-dispatcher.md`)
 * the same way `PrincipalPropertySearchReportHandler` is.
 *
 * The target collection is resolved from `context.segments`: this
 * report only supports the WebDAV file tree (`/dav/{tenant}/files/...`),
 * so a request whose first segment isn't `files`, or whose resolved
 * target isn't a `Collection`, is `404`.
 *
 * **Authorization**: `read` on the target collection (the ACL
 * evaluation engine, M3), else `403`.
 *
 * **`sync-level`**: only `"1"` is supported (immediate children only,
 * no recursive multi-level sync) — consistent with PROPFIND's own
 * `Depth: infinity` rejection (M2); any other value is `400`.
 *
 * **Sync-token validation** (`validateSyncToken`,
 * `milestones/M4-locking-sync/07-sync-collection-report/01-sync-token-format-and-validation.md`):
 * an invalid token is `403` with a `valid-sync-token` precondition (RFC
 * 6578 §3.2).
 *
 * **Initial sync** — a missing/empty `<D:sync-token>` element, checked
 * on the *raw* parsed request value, not on whether it decodes to
 * `seq: 0` (a non-empty token can legitimately decode to `seq: 0` too,
 * for a collection synced once when its history was still empty; RFC
 * 6578 §3.4 keys the initial-sync behavior off an empty element
 * specifically): every current direct child is reported as a `200`
 * response with the requested properties.
 *
 * **Incremental sync** (any non-empty token, `seq: 0` included): every
 * `collection_changes` row with `seq > token.seq` is loaded, grouped by
 * the child's `name`, and reduced to each name's *last* recorded
 * action — a name changed multiple times since the last sync (e.g.
 * `added` then `modified`) appears only once, with its current live
 * state. RFC 6578 §3.5.2 is
 * explicit that a member added and then removed within the same window
 * **must still be reported as removed** ("This ensures that a client
 * that adds a member is informed of the removal of the member, if the
 * removal occurs before the client has had a chance to execute a
 * synchronization report") — so, unlike a plain "net effect" read of
 * the change log might suggest, an `added`-then-`deleted` name is
 * reported as `404`, exactly like any other deletion, not omitted.
 *
 * A `deleted` name's `<D:response>` is a bare `404` status with no
 * `<D:propstat>` (RFC 6578 §3.2); every other (net) changed name is a
 * `200` response with the requested properties, resolved fresh from
 * the database — never reconstructed from the change-log row itself,
 * which only ever records that *something* changed, not what.
 *
 * The response always ends with a `<D:sync-token>` for the target
 * collection's *current* `syncSeq` — feeding that back into the next
 * `sync-collection` request is what makes the next sync see only
 * changes recorded after this response.
 *
 * Concrete to `collection_changes`/`Collection` rather than generic
 * over a change-log table, unlike some M3 evaluation code — the same
 * kind of deferred genericization `getEffectiveLocks` already notes for
 * M5 (`milestones/M4-locking-sync/07-sync-collection-report/00-overview.md`'s
 * own "Nachtrag").
 */
export class SyncCollectionReportHandler implements ReportHandler {
  /** See {@link ReportHandler.handle}. */
  async handle(requestXml: string, context: ReportContext): Promise<ReportResult> {
    if (context.segments[0] !== 'files') {
      return { status: 404, body: '' };
    }
    const resourcePathResolver = new ResourcePathResolver(
      context.manager.connection,
    );
    const target = await resourcePathResolver.resolve(
      context.tenant.id,
      context.segments.slice(1),
    );
    if (!target || !(target instanceof Collection)) {
      return { status: 404, body: '' };
    }

    const allowed = await hasPrivilege(
      context.manager,
      context.principal,
      target,
      'read',
    );
    if (!allowed) {
      return { status: 403, body: '' };
    }

    let requestBody;
    try {
      requestBody = parseSyncCollectionRequestBody(requestXml);
    } catch {
      return { status: 400, body: '' };
    }
    if (requestBody.syncLevel !== '1') {
      return { status: 400, body: '' };
    }

    const validation = validateSyncToken(
      requestBody.syncToken,
      target.id,
      target.syncSeq,
    );
    if (!validation.valid) {
      return {
        status: 403,
        body: buildErrorResponse(['valid-sync-token']),
      };
    }

    const registry = new PropertyProviderRegistry<WebDavResource>();
    registry.register(new WebDavLiveProperties());
    registry.register(new AclPropertiesProvider());
    registry.register(new LockPropertiesProvider());
    const deadProperties = new DeadPropertyService(context.manager.connection);
    const propertyContext: PropertyProviderContext = {
      tenant: context.tenant,
      principal: context.principal,
      manager: context.manager,
    };

    const children = await resourcePathResolver.listChildren(target);
    const childByName = new Map(
      children.map((child) => [resourceName(child), child]),
    );
    const targetHref = await resolveCollectionHref(
      context.manager,
      context.tenant,
      target.id,
    );

    const names: Array<{ name: string; action: CollectionChangeAction }> = [];
    if (requestBody.syncToken === '') {
      // RFC 6578 §3.4: a genuinely *empty* sync-token element means
      // initial sync, regardless of what seq it decodes to (an empty
      // token decodes to seq 0 via validateSyncToken, but so could a
      // legitimate non-empty token from very early in this collection's
      // history — that one must still consult the change log below, not
      // take this shortcut, or a since-deleted name from that history
      // would silently vanish instead of being reported as removed).
      for (const child of children) {
        names.push({ name: resourceName(child), action: 'added' });
      }
    } else {
      const changes = await context.manager.getRepository(CollectionChange).find({
        where: { collectionId: target.id, seq: MoreThan(validation.seq) },
        order: { seq: 'ASC' },
      });
      const lastActionByName = new Map<string, CollectionChangeAction>();
      for (const change of changes) {
        lastActionByName.set(change.name, change.action);
      }
      for (const [name, action] of lastActionByName) {
        names.push({ name, action });
      }
    }

    const resources: MultistatusResourceResult[] = [];
    for (const { name, action } of names) {
      const child = childByName.get(name);
      if (action === 'deleted' || !child) {
        resources.push({
          href: `${targetHref.replace(/\/$/, '')}/${encodeURIComponent(name)}`,
          properties: [],
          status: 404,
        });
        continue;
      }
      resources.push({
        href: await resolveResourceHref(context.manager, context.tenant, child),
        properties: await resolveRequestedProperties(
          child,
          requestBody.properties,
          registry,
          deadProperties,
          propertyContext,
        ),
      });
    }

    const body = buildMultistatusResponse(resources, {
      syncToken: encodeSyncToken(target.id, target.syncSeq),
    });
    return { status: 207, body };
  }
}
