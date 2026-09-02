import { create } from 'xmlbuilder2';
import { DAV_NAMESPACE, type PropertyName } from '../xml/request-parser.js';
import { asElement } from '../xml/xml-value.js';

/**
 * A parsed `sync-collection` REPORT request body (RFC 6578 §6.1):
 * `<D:sync-collection>(sync-token, sync-level, limit?, prop)`. `<D:limit>`
 * (RFC 5323 §5.17, result truncation) isn't parsed — this project
 * doesn't implement truncation (see
 * `milestones/M4-locking-sync/00-setting-goal.md`'s scope notes on the
 * `collection_changes` log).
 */
export interface SyncCollectionRequestBody {
  /**
   * The raw `<D:sync-token>` text content — `''` for an empty element,
   * which {@link validateSyncToken} treats as an initial sync. Parsing
   * never rejects this value; only `validateSyncToken` decides whether
   * it's acceptable.
   */
  syncToken: string;
  /**
   * The raw `<D:sync-level>` text content. RFC 6578 §6.3 allows `"1"`
   * or `"infinite"`; this project only implements `"1"` (see
   * `milestones/M4-locking-sync/07-sync-collection-report/02-sync-collection-handler.md`) —
   * the caller rejects anything else with `400`, this parser just
   * reports whatever value was sent.
   */
  syncLevel: string;
  /** The requested properties, from `<D:prop>` (RFC 4918 §14.18) — always an explicit list, unlike PROPFIND's `allprop`/`propname` alternatives. */
  properties: PropertyName[];
}

/**
 * Parses a `sync-collection` REPORT request body into a
 * {@link SyncCollectionRequestBody}.
 *
 * @throws An `Error` (including the underlying XML parser's own
 * `SyntaxError` for malformed input) if `xml` isn't a well-formed
 * `DAV:sync-collection` document, or is missing its required
 * `<D:sync-level>` element (RFC 6578 §6.1 requires it, unlike
 * `<D:sync-token>`, which this parser accepts as absent — see
 * {@link SyncCollectionRequestBody.syncToken}).
 */
export function parseSyncCollectionRequestBody(
  xml: string,
): SyncCollectionRequestBody {
  const root = create(xml).root();
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'sync-collection' ||
    rootElement.namespaceURI !== DAV_NAMESPACE
  ) {
    throw new Error(
      `Expected a DAV:sync-collection root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
    );
  }

  let syncToken = '';
  let syncLevel: string | undefined;
  const properties: PropertyName[] = [];

  root.each((child) => {
    const element = asElement(child.node);
    if (!element || element.namespaceURI !== DAV_NAMESPACE) {
      return;
    }

    if (element.localName === 'sync-token') {
      syncToken = child.node.textContent ?? '';
    } else if (element.localName === 'sync-level') {
      syncLevel = child.node.textContent ?? '';
    } else if (element.localName === 'prop') {
      child.each((propertyNode) => {
        const propertyElement = asElement(propertyNode.node);
        if (propertyElement) {
          properties.push({
            namespace: propertyElement.namespaceURI ?? '',
            name: propertyElement.localName,
          });
        }
      });
    }
  });

  if (syncLevel === undefined) {
    throw new Error('DAV:sync-collection body is missing DAV:sync-level.');
  }

  return { syncToken, syncLevel, properties };
}
