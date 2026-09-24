import { describe, expect, it } from 'vitest';
import type { AddressObject } from '../entities/address-object.entity.js';
import type { PropertyProviderContext } from '../webdav/properties/property-provider.interface.js';
import { AddressObjectLiveProperties } from './address-object-live-properties.js';

const context = {} as PropertyProviderContext;

function contact(overrides: Partial<AddressObject> = {}): AddressObject {
  return {
    id: 'id-1',
    name: 'forrest.vcf',
    etag: 'abc123',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-02-03T04:05:06.000Z'),
    ...overrides,
  } as AddressObject;
}

async function valuesOf(
  resource: AddressObject,
): Promise<Record<string, string>> {
  const properties = await new AddressObjectLiveProperties().listLiveProperties(
    resource,
    context,
  );
  return Object.fromEntries(properties.map((p) => [p.name, p.value]));
}

describe('AddressObjectLiveProperties', () => {
  it('reports the ETag verbatim as getetag', async () => {
    expect((await valuesOf(contact())).getetag).toBe('abc123');
  });

  it('reports the vCard media type as getcontenttype', async () => {
    expect((await valuesOf(contact())).getcontenttype).toBe(
      'text/vcard; charset=utf-8',
    );
  });

  it('reports an empty resourcetype — a contact is not a collection', async () => {
    expect((await valuesOf(contact())).resourcetype).toBe('');
  });

  it('reports the resource name as displayname, XML-escaped', async () => {
    expect((await valuesOf(contact({ name: 'a&b.vcf' }))).displayname).toBe(
      'a&amp;b.vcf',
    );
  });

  it('formats creationdate as ISO 8601 and getlastmodified as an HTTP date', async () => {
    const values = await valuesOf(contact());
    expect(values.creationdate).toBe('2026-01-02T03:04:05.000Z');
    expect(values.getlastmodified).toBe('Tue, 03 Feb 2026 04:05:06 GMT');
  });

  it('isLiveProperty recognizes exactly the DAV: properties it defines', () => {
    const provider = new AddressObjectLiveProperties();
    expect(provider.isLiveProperty('DAV:', 'getetag')).toBe(true);
    expect(provider.isLiveProperty('DAV:', 'getcontenttype')).toBe(true);
    expect(provider.isLiveProperty('DAV:', 'getcontentlength')).toBe(false);
    expect(provider.isLiveProperty('urn:other', 'getetag')).toBe(false);
  });
});
