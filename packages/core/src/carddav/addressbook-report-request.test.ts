import { create } from 'xmlbuilder2';
import { describe, expect, it } from 'vitest';
import { parseReportPropertySelection } from './addressbook-report-request.js';

function parse(inner: string) {
  const xml = `<C:addressbook-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">${inner}</C:addressbook-multiget>`;
  return parseReportPropertySelection(create(xml).root());
}

describe('parseReportPropertySelection', () => {
  it('defaults to allprop when the body names no property selection', () => {
    expect(parse('<D:href>/x</D:href>')).toEqual({ kind: 'allprop' });
  });

  it('parses DAV:allprop and DAV:propname', () => {
    expect(parse('<D:allprop/>')).toEqual({ kind: 'allprop' });
    expect(parse('<D:propname/>')).toEqual({ kind: 'propname' });
  });

  it('lists the requested properties in order, with address-data at its position', () => {
    const selection = parse(
      '<D:prop><D:getetag/><C:address-data/><D:getcontenttype/></D:prop>',
    );

    expect(selection).toEqual({
      kind: 'prop',
      properties: [
        { namespace: 'DAV:', name: 'getetag' },
        { namespace: 'urn:ietf:params:xml:ns:carddav', name: 'address-data' },
        { namespace: 'DAV:', name: 'getcontenttype' },
      ],
      addressData: {
        contentType: undefined,
        version: undefined,
        properties: undefined,
      },
    });
  });

  it('reads the content-type and version attributes of address-data', () => {
    const selection = parse(
      `<D:prop><C:address-data content-type="text/vcard" version="4.0"/></D:prop>`,
    );

    expect(selection).toMatchObject({
      addressData: { contentType: 'text/vcard', version: '4.0' },
    });
  });

  it('reads C:prop selectors, including novalue, for partial retrieval', () => {
    const selection = parse(
      `<D:prop><C:address-data><C:prop name="FN"/><C:prop name="PHOTO" novalue="yes"/></C:address-data></D:prop>`,
    );

    expect(selection).toMatchObject({
      addressData: {
        properties: [
          { name: 'FN', noValue: false },
          { name: 'PHOTO', noValue: true },
        ],
      },
    });
  });

  it('treats C:allprop inside address-data as the entire vCard', () => {
    const selection = parse(
      `<D:prop><C:address-data><C:allprop/></C:address-data></D:prop>`,
    );

    expect(selection).toMatchObject({ addressData: { properties: undefined } });
  });

  it('rejects a C:prop without a name attribute', () => {
    expect(() =>
      parse('<D:prop><C:address-data><C:prop/></C:address-data></D:prop>'),
    ).toThrow(/name attribute/);
  });

  it('has no addressData when address-data was not requested', () => {
    expect(parse('<D:prop><D:getetag/></D:prop>')).toMatchObject({
      kind: 'prop',
      addressData: null,
    });
  });
});
