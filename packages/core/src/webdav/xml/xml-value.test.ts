import { create, fragment } from 'xmlbuilder2';
import { describe, expect, it } from 'vitest';
import { embedRawXmlContent, serializeElementChildren } from './xml-value.js';

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
