import { create, fragment } from 'xmlbuilder2';
import { describe, expect, it } from 'vitest';
import {
  embedRawXmlContent,
  escapeXmlText,
  getAttributeValue,
  serializeElementChildren,
} from './xml-value.js';

describe('serializeElementChildren', () => {
  it('serializes plain text content, escaped', () => {
    const element = create(
      '<D:displayname xmlns:D="DAV:">Tom &amp; Jerry &lt;folder&gt;</D:displayname>',
    ).root();

    expect(serializeElementChildren(element)).toBe(
      'Tom &amp; Jerry &lt;folder&gt;',
    );
  });

  it('serializes a single nested element, with a self-contained namespace declaration', () => {
    const element = create(
      '<D:resourcetype xmlns:D="DAV:"><D:collection/></D:resourcetype>',
    ).root();

    expect(serializeElementChildren(element)).toBe(
      '<D:collection xmlns:D="DAV:"/>',
    );
  });

  it('serializes mixed text-and-element content', () => {
    const element = create(
      '<C:custom xmlns:C="urn:example:ns">before<C:nested a="1">text</C:nested>after</C:custom>',
    ).root();

    expect(serializeElementChildren(element)).toBe(
      'before<C:nested xmlns:C="urn:example:ns" a="1">text</C:nested>after',
    );
  });

  it('returns an empty string for an empty element', () => {
    const element = create('<D:foo xmlns:D="DAV:"/>').root();

    expect(serializeElementChildren(element)).toBe('');
  });
});

describe('embedRawXmlContent', () => {
  it('round-trips escaped plain text', () => {
    const destination = fragment().ele('DAV:', 'D:displayname');

    embedRawXmlContent(destination, 'Tom &amp; Jerry &lt;folder&gt;');

    expect(destination.toString()).toBe(
      '<D:displayname xmlns:D="DAV:">Tom &amp; Jerry &lt;folder&gt;</D:displayname>',
    );
  });

  it('round-trips a nested element', () => {
    const destination = fragment().ele('DAV:', 'D:resourcetype');

    embedRawXmlContent(destination, '<D:collection xmlns:D="DAV:"/>');

    expect(destination.toString()).toBe(
      '<D:resourcetype xmlns:D="DAV:"><D:collection/></D:resourcetype>',
    );
  });

  it('round-trips mixed text-and-element content', () => {
    const destination = fragment().ele('urn:example:ns', 'C:custom');

    embedRawXmlContent(
      destination,
      'before<C:nested xmlns:C="urn:example:ns" a="1">text</C:nested>after',
    );

    expect(destination.toString()).toBe(
      '<C:custom xmlns:C="urn:example:ns">before<C:nested a="1">text</C:nested>after</C:custom>',
    );
  });

  it('leaves the destination empty for an empty value', () => {
    const destination = fragment().ele('DAV:', 'D:foo');

    embedRawXmlContent(destination, '');

    expect(destination.toString()).toBe('<D:foo xmlns:D="DAV:"/>');
  });

  it('round-trips whatever serializeElementChildren produces, end to end', () => {
    const source = create(
      '<C:custom xmlns:C="urn:example:ns">before<C:nested a="1">text</C:nested>after</C:custom>',
    ).root();
    const value = serializeElementChildren(source);

    const destination = fragment().ele('urn:example:ns', 'C:custom');
    embedRawXmlContent(destination, value);

    expect(destination.toString()).toBe(source.toString());
  });
});

describe('escapeXmlText', () => {
  it('escapes the markup characters', () => {
    expect(escapeXmlText('a & b <c> d')).toBe('a &amp; b &lt;c&gt; d');
  });

  it('keeps tab, line feed and carriage return', () => {
    expect(escapeXmlText('a\tb\r\nc')).toBe('a\tb\r\nc');
  });

  it('drops the control characters XML 1.0 forbids, so the value stays embeddable and parseable', () => {
    const escaped = escapeXmlText('bad\u0000\u000B\u000C\u001F\uFFFEname');

    expect(escaped).toBe('badname');
    const destination = create().ele('urn:example', 'x');
    embedRawXmlContent(destination, escaped);
    expect(destination.end()).not.toMatch(
      // eslint-disable-next-line no-control-regex -- asserting exactly these characters are gone.
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/,
    );
  });
});

describe('getAttributeValue', () => {
  const root = create(
    '<C:prop xmlns:C="urn:example" name="FN" empty=""/>',
  ).root();

  it('reads an attribute, including an empty one', () => {
    expect(getAttributeValue(root.node, 'name')).toBe('FN');
    expect(getAttributeValue(root.node, 'empty')).toBe('');
  });

  it('returns undefined for an absent attribute or a non-element node', () => {
    expect(getAttributeValue(root.node, 'missing')).toBeUndefined();
    expect(getAttributeValue({ nodeType: 3 }, 'name')).toBeUndefined();
  });
});
