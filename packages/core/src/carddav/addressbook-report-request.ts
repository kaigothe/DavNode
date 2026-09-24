import type { PropertyName } from '../webdav/xml/request-parser.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import {
  asElement,
  getAttributeValue,
  type XmlNode,
} from '../webdav/xml/xml-value.js';
import { CARDDAV_NAMESPACE } from './carddav-namespace.js';
import type { VCardPropertySelector } from './vcard-partial.js';

/**
 * What a `CARDDAV:address-data` element in a REPORT request's
 * `<D:prop>` asks for (RFC 6352 §10.4): which media type/version the
 * client wants the data in, and which vCard properties (`undefined` =
 * the entire vCard).
 */
export interface AddressDataRequest {
  /** The `content-type` attribute as sent; `undefined` when absent (RFC default `text/vcard`, but "no preference" is how it's treated). */
  contentType: string | undefined;
  /** The `version` attribute as sent; `undefined` when absent (RFC default `3.0`, but "no preference" is how it's treated). */
  version: string | undefined;
  /** The `<C:prop>` selectors of a partial-retrieval request; `undefined` for the whole vCard (no `<C:prop>`, or `<C:allprop/>`). */
  properties: readonly VCardPropertySelector[] | undefined;
}

/**
 * Which properties a CardDAV REPORT request wants for each result
 * (RFC 6352 `(DAV:allprop | DAV:propname | DAV:prop)?`): every live
 * property, only their names, or an explicit list. `properties` of the
 * `prop` form includes `CARDDAV:address-data` at its request position;
 * its options are in `addressData`.
 */
export type ReportPropertySelection =
  | { kind: 'allprop' }
  | { kind: 'propname' }
  | {
      kind: 'prop';
      properties: PropertyName[];
      addressData: AddressDataRequest | null;
    };

/** The qualified name `CARDDAV:address-data`, as it appears in {@link ReportPropertySelection}'s property list. */
export const ADDRESS_DATA_PROPERTY: PropertyName = {
  namespace: CARDDAV_NAMESPACE,
  name: 'address-data',
};

function parseAddressData(element: XmlNode): AddressDataRequest {
  const properties: VCardPropertySelector[] = [];
  let wantsAll = false;
  element.each((child) => {
    const childElement = asElement(child.node);
    if (childElement?.namespaceURI !== CARDDAV_NAMESPACE) {
      return;
    }
    if (childElement.localName === 'allprop') {
      wantsAll = true;
    } else if (childElement.localName === 'prop') {
      const name = getAttributeValue(child.node, 'name');
      if (name === undefined || name.trim() === '') {
        throw new Error('CARDDAV:prop is missing its name attribute.');
      }
      properties.push({
        name: name.trim(),
        noValue: getAttributeValue(child.node, 'novalue') === 'yes',
      });
    }
  });

  return {
    contentType: getAttributeValue(element.node, 'content-type'),
    version: getAttributeValue(element.node, 'version'),
    properties: wantsAll || properties.length === 0 ? undefined : properties,
  };
}

/**
 * Reads the `DAV:allprop`/`DAV:propname`/`DAV:prop` child of an
 * `addressbook-query` or `addressbook-multiget` request body's `root`
 * element into a {@link ReportPropertySelection}. A request with none of
 * the three means `allprop` (RFC 6352 marks all three optional).
 *
 * @throws An `Error` if a `<C:prop>` inside `<C:address-data>` has no
 * `name` attribute — the caller maps this to `400`.
 */
export function parseReportPropertySelection(
  root: XmlNode,
): ReportPropertySelection {
  let selection: ReportPropertySelection = { kind: 'allprop' };
  root.each((child) => {
    const element = asElement(child.node);
    if (element?.namespaceURI !== DAV_NAMESPACE) {
      return;
    }
    if (element.localName === 'allprop') {
      selection = { kind: 'allprop' };
    } else if (element.localName === 'propname') {
      selection = { kind: 'propname' };
    } else if (element.localName === 'prop') {
      const properties: PropertyName[] = [];
      let addressData: AddressDataRequest | null = null;
      child.each((propertyNode) => {
        const propertyElement = asElement(propertyNode.node);
        if (!propertyElement) {
          return;
        }
        const name: PropertyName = {
          namespace: propertyElement.namespaceURI ?? '',
          name: propertyElement.localName,
        };
        if (
          name.namespace === CARDDAV_NAMESPACE &&
          name.name === ADDRESS_DATA_PROPERTY.name
        ) {
          addressData = parseAddressData(propertyNode);
        }
        properties.push(name);
      });
      selection = { kind: 'prop', properties, addressData };
    }
  });
  return selection;
}
