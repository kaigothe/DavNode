import { create } from 'xmlbuilder2';
import {
  DAV_PREFIX,
  groupByStatus,
  statusLine,
  type MultistatusPropertyResult,
} from './multistatus-builder.js';
import { DAV_NAMESPACE } from './request-parser.js';
import { embedRawXmlContent } from './xml-value.js';

/**
 * Builds an RFC 5689 §5.2-conformant `<D:mkcol-response>` XML document
 * for a successful (or partially failed) Extended MKCOL request: one
 * `<D:propstat>` per distinct status among `properties`, each grouping
 * the property names that got that status — the same grouping
 * `buildMultistatusResponse` does for PROPFIND/PROPPATCH, just under a
 * bare `<D:mkcol-response>` root instead of `<D:multistatus>`/
 * `<D:response>` (a `mkcol-response` describes exactly one resource —
 * the one just created — so there's no per-resource `<D:href>` to
 * repeat).
 *
 * RFC 5689 §3 makes this body optional on success ("the client can
 * assume that all properties were set" for an empty body) — callers may
 * still send one on success (as this function does) purely to confirm
 * which properties took effect, which is what MKCOL callers in this
 * codebase choose to do.
 */
export function buildMkcolResponse(
  properties: readonly MultistatusPropertyResult[],
): string {
  const doc = create({ version: '1.0', encoding: 'utf-8' }).ele(
    DAV_NAMESPACE,
    `${DAV_PREFIX}:mkcol-response`,
  );

  for (const [status, group] of groupByStatus([...properties])) {
    const propstat = doc.ele(DAV_NAMESPACE, `${DAV_PREFIX}:propstat`);
    const prop = propstat.ele(DAV_NAMESPACE, `${DAV_PREFIX}:prop`);
    for (const property of group) {
      const propertyElement = prop.ele(property.namespace, property.name);
      if (property.value !== undefined) {
        embedRawXmlContent(propertyElement, property.value);
      }
    }
    propstat.ele(DAV_NAMESPACE, `${DAV_PREFIX}:status`).txt(statusLine(status));
  }

  return doc.end();
}
