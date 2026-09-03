import { fragment } from 'xmlbuilder2';
import type { MkcolRequestBody } from '../webdav/xml/request-parser.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import { asElement } from '../webdav/xml/xml-value.js';
import { CARDDAV_NAMESPACE } from './carddav-namespace.js';

/**
 * Whether `body`'s `DAV:resourcetype` `<D:set>` instruction (if any)
 * requests a `CARDDAV:addressbook` (RFC 6352 §5.2) among its resource
 * types — the trigger for Extended MKCOL (RFC 5689) to create an
 * `AddressbookCollection` instead of a plain `Collection`.
 *
 * `resourcetype`'s captured value (from `parseMkcolRequestBody`, via
 * `serializeElementChildren`) is a raw XML fragment (e.g.
 * `<D:collection/><C:addressbook xmlns:C="..."/>`) — this re-parses it
 * (the same wrap-in-`<x>`-and-inspect-children technique
 * `embedRawXmlContent` uses) rather than substring-matching, so
 * attribute order or whitespace in the client's request can't produce a
 * false negative or positive.
 */
export function requestsAddressbookResourcetype(
  body: MkcolRequestBody,
): boolean {
  const resourcetype = body.properties.find(
    (entry) =>
      entry.property.namespace === DAV_NAMESPACE &&
      entry.property.name === 'resourcetype',
  );
  if (!resourcetype) {
    return false;
  }

  let requestsAddressbook = false;
  fragment(`<x>${resourcetype.value}</x>`)
    .first()
    .each((child) => {
      const element = asElement(child.node);
      if (
        element &&
        element.namespaceURI === CARDDAV_NAMESPACE &&
        element.localName === 'addressbook'
      ) {
        requestsAddressbook = true;
      }
    });
  return requestsAddressbook;
}
