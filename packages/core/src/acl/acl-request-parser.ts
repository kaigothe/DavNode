import { create } from 'xmlbuilder2';
import type { GrantDeny } from '../entities/collection-ace.entity.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import { asElement } from '../webdav/xml/xml-value.js';
import { ALL_PRIVILEGES, type Privilege } from './privilege.js';

const PRIVILEGE_NAMES = new Set<string>(ALL_PRIVILEGES);

function isPrivilegeName(value: string): value is Privilege {
  return PRIVILEGE_NAMES.has(value);
}

/**
 * One `<D:ace>` element from an `ACL` request body (RFC 3744 §8.1),
 * before its `principalUrl` is resolved to an actual `Principal` row —
 * that resolution needs database access and tenant context, so it's the
 * caller's job (see `acl.route.ts`), not this parser's.
 *
 * Only `<D:principal><D:href>...</D:href></D:principal>` is supported —
 * the special-principal element forms (`<D:all/>`, `<D:authenticated/>`,
 * ...) aren't, since M3's ACL-HTTP-method scope only covers href-based
 * principal references. An `<D:ace>` using one of those instead is still
 * included (with `principalUrl: null`), rather than silently dropped:
 * `ACL` replaces the *complete* ACE list, so a form this parser can't
 * resolve must surface as a rejected principal reference
 * (`DAV:recognized-principal`, RFC 3744 §9.2) rather than silently
 * vanishing from what the client asked to set.
 */
export interface AclRequestAce {
  /** The `<D:href>` URL inside `<D:principal>`, or `null` if this `<D:ace>`'s principal wasn't a `<D:href>` (see above). */
  principalUrl: string | null;
  /** Whether this is a `<D:grant>` or `<D:deny>` element. */
  grantDeny: GrantDeny;
  /** The privileges listed inside the `<D:grant>`/`<D:deny>` element. */
  privileges: Privilege[];
  /**
   * Whether this `<D:ace>` included a `<D:inherited>` element — RFC 3744
   * §5.5 metadata a client should only ever *read*, never submit back;
   * present so `acl.route.ts` can reject the whole request rather than
   * silently accepting a claim that isn't its to make.
   */
  inherited: boolean;
}

/** A parsed `ACL` request body (RFC 3744 §8.1): the complete desired non-protected, non-inherited ACE list. */
export interface AclRequestBody {
  aces: AclRequestAce[];
}

/**
 * Parses an `ACL` request body into an {@link AclRequestBody}.
 *
 * @param xml - The raw request body. Unlike PROPFIND, `ACL` has no
 * meaningful "empty body" case — a body is always required.
 * @throws An `Error` (including the underlying XML parser's own
 * `SyntaxError` for malformed input) if `xml` isn't a well-formed
 * `DAV:acl` document.
 */
export function parseAclRequestBody(xml: string): AclRequestBody {
  const root = create(xml).root();
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'acl' ||
    rootElement.namespaceURI !== DAV_NAMESPACE
  ) {
    throw new Error(
      `Expected a DAV:acl root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
    );
  }

  const aces: AclRequestAce[] = [];
  root.each((aceNode) => {
    const aceElement = asElement(aceNode.node);
    if (
      !aceElement ||
      aceElement.namespaceURI !== DAV_NAMESPACE ||
      aceElement.localName !== 'ace'
    ) {
      return;
    }

    let principalUrl: string | undefined;
    let grantDeny: GrantDeny | undefined;
    const privileges: Privilege[] = [];
    let inherited = false;

    aceNode.each((child) => {
      const childElement = asElement(child.node);
      if (!childElement || childElement.namespaceURI !== DAV_NAMESPACE) {
        return;
      }

      if (childElement.localName === 'principal') {
        child.each((principalChild) => {
          const principalChildElement = asElement(principalChild.node);
          if (
            principalChildElement?.namespaceURI === DAV_NAMESPACE &&
            principalChildElement.localName === 'href'
          ) {
            principalUrl = principalChild.node.textContent ?? '';
          }
        });
      } else if (childElement.localName === 'grant' || childElement.localName === 'deny') {
        grantDeny = childElement.localName === 'grant' ? 'grant' : 'deny';
        child.each((privilegeNode) => {
          const privilegeElement = asElement(privilegeNode.node);
          if (
            !privilegeElement ||
            privilegeElement.namespaceURI !== DAV_NAMESPACE ||
            privilegeElement.localName !== 'privilege'
          ) {
            return;
          }
          privilegeNode.each((privilegeValueNode) => {
            const privilegeValueElement = asElement(privilegeValueNode.node);
            if (
              privilegeValueElement?.namespaceURI === DAV_NAMESPACE &&
              isPrivilegeName(privilegeValueElement.localName)
            ) {
              privileges.push(privilegeValueElement.localName);
            }
          });
        });
      } else if (childElement.localName === 'inherited') {
        inherited = true;
      }
    });

    if (grantDeny !== undefined) {
      aces.push({ principalUrl: principalUrl ?? null, grantDeny, privileges, inherited });
    }
  });

  return { aces };
}
