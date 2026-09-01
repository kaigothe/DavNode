import { describe, expect, it } from 'vitest';
import {
  parsePropfindRequestBody,
  parseProppatchRequestBody,
} from './request-parser.js';

describe('parsePropfindRequestBody', () => {
  it('parses an allprop request', () => {
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
      <D:propfind xmlns:D="DAV:">
        <D:allprop/>
      </D:propfind>`;

    expect(parsePropfindRequestBody(xml)).toEqual({ kind: 'allprop' });
  });

  it('parses a propname request', () => {
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
      <D:propfind xmlns:D="DAV:">
        <D:propname/>
      </D:propfind>`;

    expect(parsePropfindRequestBody(xml)).toEqual({ kind: 'propname' });
  });

  it('parses a prop request, listing every requested property with its namespace', () => {
    // Adapted from RFC 4918 §9.1's example.
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
      <D:propfind xmlns:D="DAV:">
        <D:prop xmlns:R="http://ns.example.com/boxschema/">
          <R:bigbox/>
          <D:displayname/>
        </D:prop>
      </D:propfind>`;

    expect(parsePropfindRequestBody(xml)).toEqual({
      kind: 'prop',
      properties: [
        { namespace: 'http://ns.example.com/boxschema/', name: 'bigbox' },
        { namespace: 'DAV:', name: 'displayname' },
      ],
    });
  });

  it('treats a missing body as an allprop request (RFC 4918 §9.1)', () => {
    expect(parsePropfindRequestBody(undefined)).toEqual({ kind: 'allprop' });
    expect(parsePropfindRequestBody(null)).toEqual({ kind: 'allprop' });
  });

  it('treats an empty (or whitespace-only) body as an allprop request', () => {
    expect(parsePropfindRequestBody('')).toEqual({ kind: 'allprop' });
    expect(parsePropfindRequestBody('   \n  ')).toEqual({ kind: 'allprop' });
  });

  it('resolves DAV: elements regardless of which prefix the client used', () => {
    const defaultNamespaceXml = `<propfind xmlns="DAV:"><propname/></propfind>`;
    const differentPrefixXml = `<x:propfind xmlns:x="DAV:"><x:allprop/></x:propfind>`;

    expect(parsePropfindRequestBody(defaultNamespaceXml)).toEqual({
      kind: 'propname',
    });
    expect(parsePropfindRequestBody(differentPrefixXml)).toEqual({
      kind: 'allprop',
    });
  });

  it('throws for a root element that is not DAV:propfind', () => {
    const xml = `<D:propertyupdate xmlns:D="DAV:"><D:set/></D:propertyupdate>`;

    expect(() => parsePropfindRequestBody(xml)).toThrow(/DAV:propfind/);
  });

  it('throws when the body has none of allprop, propname, or prop', () => {
    const xml = `<D:propfind xmlns:D="DAV:"></D:propfind>`;

    expect(() => parsePropfindRequestBody(xml)).toThrow(
      /allprop.*propname.*prop/,
    );
  });
});

describe('parseProppatchRequestBody', () => {
  it('parses set and remove instructions, in document order', () => {
    // Adapted from RFC 4918 §9.2.1's example.
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
      <D:propertyupdate xmlns:D="DAV:" xmlns:Z="http://ns.example.com/z/">
        <D:set>
          <D:prop>
            <Z:Authors>
              <Z:Author>Jim Whitehead</Z:Author>
              <Z:Author>Roy Fielding</Z:Author>
            </Z:Authors>
          </D:prop>
        </D:set>
        <D:remove>
          <D:prop><Z:Copyright-Owner/></D:prop>
        </D:remove>
      </D:propertyupdate>`;

    const result = parseProppatchRequestBody(xml);

    expect(result.operations).toEqual([
      {
        kind: 'set',
        property: { namespace: 'http://ns.example.com/z/', name: 'Authors' },
        value:
          '<Z:Author xmlns:Z="http://ns.example.com/z/">Jim Whitehead</Z:Author><Z:Author xmlns:Z="http://ns.example.com/z/">Roy Fielding</Z:Author>',
      },
      {
        kind: 'remove',
        property: {
          namespace: 'http://ns.example.com/z/',
          name: 'Copyright-Owner',
        },
      },
    ]);
  });

  it('captures a plain-text set value as escaped text', () => {
    const xml = `<D:propertyupdate xmlns:D="DAV:">
      <D:set>
        <D:prop><D:displayname>My Folder</D:displayname></D:prop>
      </D:set>
    </D:propertyupdate>`;

    expect(parseProppatchRequestBody(xml).operations).toEqual([
      {
        kind: 'set',
        property: { namespace: 'DAV:', name: 'displayname' },
        value: 'My Folder',
      },
    ]);
  });

  it('supports multiple properties per set/remove block', () => {
    const xml = `<D:propertyupdate xmlns:D="DAV:" xmlns:C="urn:example:ns">
      <D:set>
        <D:prop>
          <D:displayname>My Folder</D:displayname>
          <C:color>blue</C:color>
        </D:prop>
      </D:set>
    </D:propertyupdate>`;

    expect(parseProppatchRequestBody(xml).operations).toEqual([
      {
        kind: 'set',
        property: { namespace: 'DAV:', name: 'displayname' },
        value: 'My Folder',
      },
      {
        kind: 'set',
        property: { namespace: 'urn:example:ns', name: 'color' },
        value: 'blue',
      },
    ]);
  });

  it('throws for a root element that is not DAV:propertyupdate', () => {
    const xml = `<D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>`;

    expect(() => parseProppatchRequestBody(xml)).toThrow(/DAV:propertyupdate/);
  });
});
