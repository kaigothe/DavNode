import type { EntityManager } from 'typeorm';
import { create } from 'xmlbuilder2';
import type { Principal } from '../entities/principal.entity.js';
import type { Tenant } from '../entities/tenant.entity.js';
import { asElement } from './xml/xml-value.js';

/**
 * Per-request context a {@link ReportHandler} needs — the same shape as
 * `PropertyProviderContext` (`webdav/properties/property-provider.interface.ts`):
 * the tenant and requesting principal, an `EntityManager` for the
 * handler's own DB access, and the request URL's full path segments
 * after `/dav/{tenantSlug}` — e.g. `['files', 'reports', 'q3.pdf']` for
 * `REPORT /dav/acme/files/reports/q3.pdf`. Deliberately **not** stripped
 * of a tree-prefix segment like `files`/`principals` the way
 * `pathSegments` in `@davnode/server`'s route files is (those routes'
 * own patterns already consume that literal segment; this dispatcher's
 * route pattern doesn't, since REPORT can target any tree) — a handler
 * that cares which resource the request targets (M4's
 * `sync-collection`, unlike M3's tree-wide
 * `principal-property-search`, which ignores this field) must interpret
 * that structure itself, e.g. confirming `segments[0] === 'files'` before
 * resolving the rest via `ResourcePathResolver`. Added when
 * `sync-collection` revealed `principal-property-search` alone hadn't
 * needed it yet, the same way `PropertyProviderContext` grew its own
 * fields once a second property provider needed more than the first
 * (M3's ACL properties).
 */
export interface ReportContext {
  tenant: Tenant;
  principal: Principal;
  manager: EntityManager;
  segments: readonly string[];
}

/**
 * What a {@link ReportHandler} produces: enough for `report.route.ts` to
 * build the HTTP response without knowing what kind of report produced
 * it (every report so far responds `207 Multi-Status`, but the
 * dispatcher itself makes no assumption of that).
 */
export interface ReportResult {
  status: number;
  body: string;
}

/**
 * Handles one REPORT type (RFC 3253 §3.6), identified by its request
 * body's root XML element (e.g. `{DAV:}principal-property-search`, M3's
 * `principal-property-search-report.ts`). Registered into a
 * {@link ReportRegistry} (`report.route.ts`'s generic REPORT dispatcher)
 * so later milestones (M4 `sync-collection`, M5/M6 CalDAV/CardDAV
 * reports) add themselves without the dispatcher itself changing.
 */
export interface ReportHandler {
  /**
   * Runs this report.
   *
   * @param requestXml - The complete, raw REPORT request body. The
   * dispatcher only inspects the root element to route the request
   * here — parsing the rest is this handler's own job, the same
   * division every other `parseXxxRequestBody` in this codebase
   * follows.
   * @param context - The requesting tenant/principal and a DB manager.
   */
  handle(requestXml: string, context: ReportContext): Promise<ReportResult>;
}

/**
 * A registry of {@link ReportHandler}s, indexed by their request body's
 * root element (`{namespace}{localName}`, e.g.
 * `DAV:principal-property-search`) — the same registration pattern as
 * `AuthProviderRegistry` (M1): handlers register themselves, so
 * `report.route.ts`'s dispatcher never needs to know about a specific
 * report's request/response shape ahead of time.
 */
export class ReportRegistry {
  private readonly handlers = new Map<string, ReportHandler>();

  /**
   * Registers `handler` for REPORT requests whose root element is
   * `{namespace}localName`. Registering a second handler under the same
   * key replaces the previously registered one.
   */
  register(namespace: string, localName: string, handler: ReportHandler): void {
    this.handlers.set(`${namespace}${localName}`, handler);
  }

  /** Looks up a previously registered handler for `{namespace}localName`. */
  resolve(namespace: string, localName: string): ReportHandler | undefined {
    return this.handlers.get(`${namespace}${localName}`);
  }
}

/**
 * Reads a REPORT request body's root element — just enough for
 * `report.route.ts` to look the right handler up in a
 * {@link ReportRegistry}. The handler itself re-parses the full body
 * (see {@link ReportHandler.handle}), so this deliberately looks no
 * deeper than the root element's own namespace/local name.
 *
 * @returns The root element's namespace/local name, or `null` if `xml`
 * is empty or isn't well-formed — REPORT always requires a body
 * (RFC 3253 §3.6), so either case is the caller's cue to reject the
 * request rather than dispatch it.
 */
export function parseReportRootElement(
  xml: string,
): { namespace: string; name: string } | null {
  if (xml.trim() === '') {
    return null;
  }
  let root: ReturnType<ReturnType<typeof create>['root']>;
  try {
    root = create(xml).root();
  } catch {
    return null;
  }
  const rootElement = asElement(root.node);
  if (!rootElement) {
    return null;
  }
  return {
    namespace: rootElement.namespaceURI ?? '',
    name: rootElement.localName,
  };
}
