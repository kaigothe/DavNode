import { describe, expect, it } from 'vitest';
import { parseMkcolRequestBody } from '../webdav/xml/request-parser.js';
import { requestsAddressbookResourcetype } from './mkcol-addressbook-request.js';

describe('requestsAddressbookResourcetype', () => {
  it('returns true when resourcetype includes CARDDAV:addressbook', () => {
    const body = parseMkcolRequestBody(`
      <D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
        <D:set>
          <D:prop>
            <D:resourcetype><D:collection/><C:addressbook/></D:resourcetype>
            <D:displayname>Personal</D:displayname>
          </D:prop>
        </D:set>
      </D:mkcol>`);

    expect(requestsAddressbookResourcetype(body)).toBe(true);
  });

  it('returns false when resourcetype is a plain DAV:collection', () => {
    const body = parseMkcolRequestBody(`
      <D:mkcol xmlns:D="DAV:">
        <D:set>
          <D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop>
        </D:set>
      </D:mkcol>`);

    expect(requestsAddressbookResourcetype(body)).toBe(false);
  });

  it('returns false when resourcetype is missing entirely', () => {
    const body = parseMkcolRequestBody(`
      <D:mkcol xmlns:D="DAV:">
        <D:set>
          <D:prop><D:displayname>Personal</D:displayname></D:prop>
        </D:set>
      </D:mkcol>`);

    expect(requestsAddressbookResourcetype(body)).toBe(false);
  });

  it('is unaffected by a different namespace prefix or attribute order for the same element', () => {
    const body = parseMkcolRequestBody(`
      <D:mkcol xmlns:D="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
        <D:set>
          <D:prop>
            <D:resourcetype><card:addressbook/><D:collection/></D:resourcetype>
          </D:prop>
        </D:set>
      </D:mkcol>`);

    expect(requestsAddressbookResourcetype(body)).toBe(true);
  });
});
