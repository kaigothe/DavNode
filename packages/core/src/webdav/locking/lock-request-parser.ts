import { create } from 'xmlbuilder2';
import {
  LOCK_SCOPE_VALUES,
  type LockScope,
} from '../../entities/collection-lock.entity.js';
import { DAV_NAMESPACE } from '../xml/request-parser.js';
import { asElement, serializeElementChildren } from '../xml/xml-value.js';

const LOCK_SCOPE_NAMES = new Set<string>(LOCK_SCOPE_VALUES);

function isLockScopeName(value: string): value is LockScope {
  return LOCK_SCOPE_NAMES.has(value);
}

/**
 * A parsed LOCK request body's `<D:lockinfo>` (RFC 4918 §14.13) —
 * lock-creation requests only; a refresh request (RFC 4918 §9.10.2) has
 * no body at all, so it never reaches this parser.
 */
export interface LockInfoRequestBody {
  /** The requested `<D:lockscope>`: `exclusive` or `shared`. */
  scope: LockScope;
  /**
   * The client's `<D:owner>` element, captured as raw inner XML content
   * (the same dead-property-style round-trip `serializeElementChildren`/
   * `embedRawXmlContent` use elsewhere) — RFC 4918 §14.17 requires the
   * server preserve it unaltered. `null` if the client omitted
   * `<D:owner>` entirely (it's optional in `<D:lockinfo>`).
   */
  ownerInfo: string | null;
}

/**
 * Parses a LOCK request body into a {@link LockInfoRequestBody}.
 *
 * @param xml - The raw request body.
 * @throws An `Error` (including the underlying XML parser's own
 * `SyntaxError` for malformed or empty input) if `xml` isn't a
 * well-formed `DAV:lockinfo` document naming a supported
 * `<D:lockscope>` and a `<D:locktype><D:write/></D:locktype>` — RFC 4918
 * defines no lock type other than `write`.
 */
export function parseLockInfoRequestBody(xml: string): LockInfoRequestBody {
  const root = create(xml).root();
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'lockinfo' ||
    rootElement.namespaceURI !== DAV_NAMESPACE
  ) {
    throw new Error(
      `Expected a DAV:lockinfo root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
    );
  }

  let scope: LockScope | undefined;
  let hasWriteLockType = false;
  let ownerInfo: string | null = null;

  root.each((child) => {
    const element = asElement(child.node);
    if (!element || element.namespaceURI !== DAV_NAMESPACE) {
      return;
    }

    if (element.localName === 'lockscope') {
      child.each((scopeChild) => {
        const scopeElement = asElement(scopeChild.node);
        if (
          scopeElement?.namespaceURI === DAV_NAMESPACE &&
          isLockScopeName(scopeElement.localName)
        ) {
          scope = scopeElement.localName;
        }
      });
    } else if (element.localName === 'locktype') {
      child.each((typeChild) => {
        const typeElement = asElement(typeChild.node);
        if (
          typeElement?.namespaceURI === DAV_NAMESPACE &&
          typeElement.localName === 'write'
        ) {
          hasWriteLockType = true;
        }
      });
    } else if (element.localName === 'owner') {
      ownerInfo = serializeElementChildren(child);
    }
  });

  if (scope === undefined) {
    throw new Error(
      'DAV:lockinfo body is missing a supported DAV:lockscope (exclusive or shared).',
    );
  }
  if (!hasWriteLockType) {
    throw new Error(
      'DAV:lockinfo body is missing DAV:locktype write — RFC 4918 defines no other lock type.',
    );
  }

  return { scope, ownerInfo };
}
