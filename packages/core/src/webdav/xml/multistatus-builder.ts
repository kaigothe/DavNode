import { create } from 'xmlbuilder2';
import { DAV_NAMESPACE, type PropertyName } from './request-parser.js';
import { embedRawXmlContent } from './xml-value.js';

/** One property's outcome within a {@link MultistatusResourceResult}. */
export interface MultistatusPropertyResult extends PropertyName {
  /**
   * The property's value, as XML content to place inside its element —
   * see `serializeElementChildren`/`embedRawXmlContent` in
   * `xml-value.ts` for what this string may contain. Omit it for a
   * failed lookup (a non-`200` `status`): RFC 4918 §14.16 only expects
   * the empty property element in that case.
   */
  value?: string;
  /** This property's own HTTP status code (e.g. `200`, `404`). */
  status: number;
}

/** One resource's PROPFIND/PROPPATCH result: its href and per-property outcomes. */
export interface MultistatusResourceResult {
  /** The resource's URL, used as the `<D:href>` value verbatim. */
  href: string;
  properties: MultistatusPropertyResult[];
  /**
   * A response-level status, replacing the usual per-property
   * `<D:propstat>` breakdown with a single bare `<D:status>` directly
   * under `<D:response>` — `properties` is ignored when this is set.
   * RFC 6578 §3.2 requires exactly this shape for a `sync-collection`
   * REPORT's removed members (`404`, "MUST NOT contain any
   * DAV:propstat element"), which doesn't fit the property-level model
   * PROPFIND/PROPPATCH/ACL all share (there's no property list to
   * report a status *for* — the whole member is simply gone).
   */
  status?: number;
}

const DAV_PREFIX = 'D';

const STATUS_REASON_PHRASES: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  424: 'Failed Dependency',
  507: 'Insufficient Storage',
};

function statusLine(status: number): string {
  const reasonPhrase = STATUS_REASON_PHRASES[status];
  return reasonPhrase
    ? `HTTP/1.1 ${status} ${reasonPhrase}`
    : `HTTP/1.1 ${status}`;
}

/**
 * Groups `properties` by status code, preserving each status's first
 * position of occurrence — so e.g. a resource with mostly-200,
 * some-404 properties gets its `<D:propstat>` blocks in that same
 * order, matching the order PROPFIND/PROPPATCH handlers naturally
 * produce results in (found properties first, then not-found ones).
 */
function groupByStatus(
  properties: MultistatusPropertyResult[],
): Array<[number, MultistatusPropertyResult[]]> {
  const groups = new Map<number, MultistatusPropertyResult[]>();
  for (const property of properties) {
    const group = groups.get(property.status);
    if (group) {
      group.push(property);
    } else {
      groups.set(property.status, [property]);
    }
  }
  return [...groups.entries()];
}

/**
 * Builds an RFC 4918 §14.16-conformant `<D:multistatus>` XML document
 * from a list of per-resource property results.
 *
 * Properties for the same resource with different statuses (e.g. some
 * found, some not) are grouped into separate `<D:propstat>` blocks, one
 * per distinct status — the shape both PROPFIND and PROPPATCH responses
 * need. Reused as-is by future REPORT methods that report per-property
 * results (M3 ACL, M4 `sync-collection`, M5/M6 CalDAV/CardDAV).
 *
 * Property namespaces don't need a pre-assigned prefix: passing a bare
 * namespace URI to xmlbuilder2 reuses the `D:` prefix already bound to
 * {@link DAV_NAMESPACE} at the root for DAV properties, and falls back
 * to a scoped default-namespace declaration for any other namespace —
 * both are well-formed, unambiguous XML regardless of which prefix (if
 * any) the requesting client originally used.
 *
 * @param resources - One entry per resource in the response.
 * @param options - `syncToken`, when set, is appended as a trailing
 * `<D:sync-token>` sibling of the `<D:response>` elements (RFC 6578
 * §3.2's `sync-collection` REPORT response shape) — omitted entirely
 * for every other multistatus response (PROPFIND, PROPPATCH, M3 ACL),
 * which don't have one.
 */
export function buildMultistatusResponse(
  resources: MultistatusResourceResult[],
  options: { syncToken?: string } = {},
): string {
  const doc = create({ version: '1.0', encoding: 'utf-8' }).ele(
    DAV_NAMESPACE,
    `${DAV_PREFIX}:multistatus`,
  );

  for (const resource of resources) {
    const response = doc.ele(DAV_NAMESPACE, `${DAV_PREFIX}:response`);
    response.ele(DAV_NAMESPACE, `${DAV_PREFIX}:href`).txt(resource.href);

    if (resource.status !== undefined) {
      response
        .ele(DAV_NAMESPACE, `${DAV_PREFIX}:status`)
        .txt(statusLine(resource.status));
      continue;
    }

    for (const [status, properties] of groupByStatus(resource.properties)) {
      const propstat = response.ele(DAV_NAMESPACE, `${DAV_PREFIX}:propstat`);
      const prop = propstat.ele(DAV_NAMESPACE, `${DAV_PREFIX}:prop`);
      for (const property of properties) {
        const propertyElement = prop.ele(property.namespace, property.name);
        if (property.value !== undefined) {
          embedRawXmlContent(propertyElement, property.value);
        }
      }
      propstat
        .ele(DAV_NAMESPACE, `${DAV_PREFIX}:status`)
        .txt(statusLine(status));
    }
  }

  if (options.syncToken !== undefined) {
    doc
      .ele(DAV_NAMESPACE, `${DAV_PREFIX}:sync-token`)
      .txt(options.syncToken);
  }

  return doc.end();
}
