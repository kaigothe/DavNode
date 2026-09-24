import { create } from 'xmlbuilder2';
import { DAV_NAMESPACE } from './request-parser.js';
import type { XmlNode } from './xml-value.js';

const DAV_PREFIX = 'D';

/**
 * One precondition/postcondition element inside a `<D:error>` — the
 * namespace-aware form of the plain `DAV:` local names
 * {@link buildErrorResponse} also accepts. Needed for the CardDAV
 * conditions (RFC 6352), which live in `urn:ietf:params:xml:ns:carddav`
 * and, for `supported-filter`, name the offending filter as a nested
 * element.
 */
export interface ErrorCondition {
  /** The condition element's XML namespace URI. */
  namespace: string;
  /** The condition element's local name, e.g. `supported-filter`. */
  name: string;
  /** Attributes on the condition element, e.g. `name="X-FOO"` on a nested `prop-filter`. */
  attributes?: Readonly<Record<string, string>>;
  /** Nested condition elements. */
  children?: readonly ErrorCondition[];
}

/**
 * Appends `conditions` as child elements of `parent` (an already-created
 * `<D:error>` element). A bare string is the local name of a `DAV:`
 * element; an {@link ErrorCondition} names its own namespace. Shared by
 * {@link buildErrorResponse} and the multistatus builder's per-response
 * `<D:error>`, so both emit conditions identically.
 */
export function appendErrorConditions(
  parent: XmlNode,
  conditions: readonly (string | ErrorCondition)[],
): void {
  for (const condition of conditions) {
    if (typeof condition === 'string') {
      parent.ele(DAV_NAMESPACE, `${DAV_PREFIX}:${condition}`);
      continue;
    }
    const element = parent.ele(condition.namespace, condition.name);
    for (const [attribute, value] of Object.entries(
      condition.attributes ?? {},
    )) {
      element.att(attribute, value);
    }
    appendErrorConditions(element, condition.children ?? []);
  }
}

/**
 * Builds an RFC 4918 §16-conformant `<D:error>` XML document, listing
 * one or more precondition/postcondition failure elements — e.g.
 * `no-protected-ace-conflict` for RFC 3744 §8.1.1's `ACL` method. Meant
 * to accompany a `403`/`409` response whose body needs to name exactly
 * which condition failed, rather than a bare status code.
 *
 * @param conditions - The failed conditions: a bare string is the local
 * name of a `DAV:` element (e.g. `'no-protected-ace-conflict'`); an
 * {@link ErrorCondition} names a condition in another namespace (e.g.
 * CardDAV's `supported-filter`).
 */
export function buildErrorResponse(
  conditions: readonly (string | ErrorCondition)[],
): string {
  const doc = create({ version: '1.0', encoding: 'utf-8' }).ele(
    DAV_NAMESPACE,
    `${DAV_PREFIX}:error`,
  );
  appendErrorConditions(doc, conditions);
  return doc.end();
}
