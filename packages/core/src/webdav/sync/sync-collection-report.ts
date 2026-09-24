import type { CollectionChangeAction } from '../../entities/collection-change.entity.js';
import type {
  ReportContext,
  ReportHandler,
  ReportResult,
} from '../report-registry.js';
import { buildErrorResponse } from '../xml/error-response-builder.js';
import {
  buildMultistatusResponse,
  type MultistatusResourceResult,
} from '../xml/multistatus-builder.js';
import type {
  SyncCollectionDomain,
  SyncCollectionTarget,
} from './sync-collection-domain.js';
import { parseSyncCollectionRequestBody } from './sync-collection-request-parser.js';
import { encodeSyncToken } from './sync-token.js';
import { validateSyncToken } from './validate-sync-token.js';
import { WebDavSyncCollectionDomain } from './webdav-sync-domain.js';

/**
 * Handles the `{DAV:}sync-collection` REPORT (RFC 6578) — registered
 * into the generic REPORT dispatcher (M3,
 * `milestones/M3-webdav-acl/06-principals-and-report-infrastructure/02-generic-report-dispatcher.md`)
 * the same way `PrincipalPropertySearchReportHandler` is.
 *
 * **One handler, several resource domains**: `{DAV:}sync-collection` is
 * a single registry key, and RFC 6578 defines the report identically for
 * every collection type, so this class holds the shared algorithm
 * (parsing, token validation, change-log reduction, response building)
 * and delegates everything domain-specific to a list of
 * {@link SyncCollectionDomain}s — the WebDAV file tree
 * (`WebDavSyncCollectionDomain`, the default) and, from M5 on, the
 * addressbook tree (`AddressbookSyncCollectionDomain`). The first
 * domain whose `resolveTarget` recognizes the request path handles it;
 * none does → `404`. Each domain reads its own change-log table behind
 * the `ChangeLogRepository` interface, so this file never names one.
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
 * change-log entry with `seq > token.seq` is loaded, grouped by
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
 */
export class SyncCollectionReportHandler implements ReportHandler {
  /**
   * @param domains - The resource domains this handler serves, tried in
   * order. Defaults to the WebDAV file tree alone, which keeps the M4
   * construction (`new SyncCollectionReportHandler()`) working
   * unchanged; the application passes every domain it serves.
   */
  constructor(
    private readonly domains: readonly SyncCollectionDomain[] = [
      new WebDavSyncCollectionDomain(),
    ],
  ) {}

  /** See {@link ReportHandler.handle}. */
  async handle(
    requestXml: string,
    context: ReportContext,
  ): Promise<ReportResult> {
    let target: SyncCollectionTarget | null = null;
    for (const domain of this.domains) {
      target = await domain.resolveTarget(context);
      if (target) {
        break;
      }
    }
    if (!target) {
      return { status: 404, body: '' };
    }

    if (!(await target.canRead())) {
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

    const members = await target.listMembers();
    const memberByName = new Map(
      members.map((member) => [member.name, member]),
    );
    const targetHref = await target.resolveHref();

    const names: Array<{ name: string; action: CollectionChangeAction }> = [];
    if (requestBody.syncToken === '') {
      // RFC 6578 §3.4: a genuinely *empty* sync-token element means
      // initial sync, regardless of what seq it decodes to (an empty
      // token decodes to seq 0 via validateSyncToken, but so could a
      // legitimate non-empty token from very early in this collection's
      // history — that one must still consult the change log below, not
      // take this shortcut, or a since-deleted name from that history
      // would silently vanish instead of being reported as removed).
      for (const member of members) {
        names.push({ name: member.name, action: 'added' });
      }
    } else {
      const changes = await target.changeLog.loadChangesSince(
        context.manager,
        target.id,
        validation.seq,
      );
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
      const member = memberByName.get(name);
      if (action === 'deleted' || !member) {
        resources.push({
          href: `${targetHref.replace(/\/$/, '')}/${encodeURIComponent(name)}`,
          properties: [],
          status: 404,
        });
        continue;
      }
      resources.push({
        href: await member.resolveHref(),
        properties: await member.resolveProperties(requestBody.properties),
      });
    }

    const body = buildMultistatusResponse(resources, {
      syncToken: encodeSyncToken(target.id, target.syncSeq),
    });
    return { status: 207, body };
  }
}
