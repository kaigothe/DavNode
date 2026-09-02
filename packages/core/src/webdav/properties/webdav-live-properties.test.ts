import type { EntityManager } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { Collection } from '../../entities/collection.entity.js';
import { FileResource } from '../../entities/file-resource.entity.js';
import type { Principal } from '../../entities/principal.entity.js';
import type { Tenant } from '../../entities/tenant.entity.js';
import type { PropertyProviderContext } from './property-provider.interface.js';
import { WebDavLiveProperties } from './webdav-live-properties.js';

/** `WebDavLiveProperties` never reads `context` — this stands in for one it will never touch. */
const FAKE_CONTEXT: PropertyProviderContext = {
  tenant: { id: 'tenant-1', slug: 'acme' } as Tenant,
  principal: { id: 'principal-1' } as Principal,
  manager: {} as EntityManager,
};

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return Object.assign(new Collection(), {
    id: 'collection-1',
    tenantId: 'tenant-1',
    parentCollectionId: null,
    ownerPrincipalId: 'principal-1',
    displayName: 'My Folder',
    syncSeq: 0,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-06-15T12:30:00.000Z'),
    ...overrides,
  });
}

function makeFileResource(overrides: Partial<FileResource> = {}): FileResource {
  return Object.assign(new FileResource(), {
    id: 'file-1',
    tenantId: 'tenant-1',
    collectionId: 'collection-1',
    name: 'report.txt',
    contentType: 'text/plain',
    etag: '"abc123"',
    sizeBytes: 1024,
    ownerPrincipalId: 'principal-1',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-06-15T12:30:00.000Z'),
    ...overrides,
  });
}

describe('WebDavLiveProperties', () => {
  describe('listLiveProperties', () => {
    it('reports resourcetype = <D:collection/> for a Collection', async () => {
      const properties = await new WebDavLiveProperties().listLiveProperties(
        makeCollection(),
        FAKE_CONTEXT,
      );

      const resourcetype = properties.find((p) => p.name === 'resourcetype');
      expect(resourcetype).toEqual({
        namespace: 'DAV:',
        name: 'resourcetype',
        value: '<D:collection xmlns:D="DAV:"/>',
      });
    });

    it('reports an empty resourcetype for a FileResource', async () => {
      const properties = await new WebDavLiveProperties().listLiveProperties(
        makeFileResource(),
        FAKE_CONTEXT,
      );

      const resourcetype = properties.find((p) => p.name === 'resourcetype');
      expect(resourcetype).toEqual({
        namespace: 'DAV:',
        name: 'resourcetype',
        value: '',
      });
    });

    it('derives displayname from Collection.displayName', async () => {
      const properties = await new WebDavLiveProperties().listLiveProperties(
        makeCollection({ displayName: 'Tom & Jerry' }),
        FAKE_CONTEXT,
      );

      expect(properties.find((p) => p.name === 'displayname')).toEqual({
        namespace: 'DAV:',
        name: 'displayname',
        value: 'Tom &amp; Jerry',
      });
    });

    it('derives displayname from FileResource.name', async () => {
      const properties = await new WebDavLiveProperties().listLiveProperties(
        makeFileResource({ name: 'report <final>.txt' }),
        FAKE_CONTEXT,
      );

      expect(properties.find((p) => p.name === 'displayname')).toEqual({
        namespace: 'DAV:',
        name: 'displayname',
        value: 'report &lt;final&gt;.txt',
      });
    });

    it('derives getcontentlength/getcontenttype/getetag for a FileResource', async () => {
      const properties = await new WebDavLiveProperties().listLiveProperties(
        makeFileResource({
          sizeBytes: 42,
          contentType: 'text/plain',
          etag: '"xyz"',
        }),
        FAKE_CONTEXT,
      );

      expect(properties.find((p) => p.name === 'getcontentlength')?.value).toBe(
        '42',
      );
      expect(properties.find((p) => p.name === 'getcontenttype')?.value).toBe(
        'text/plain',
      );
      expect(properties.find((p) => p.name === 'getetag')?.value).toBe('"xyz"');
    });

    it('omits file-only properties for a Collection', async () => {
      const properties = await new WebDavLiveProperties().listLiveProperties(
        makeCollection(),
        FAKE_CONTEXT,
      );

      expect(
        properties.find((p) => p.name === 'getcontentlength'),
      ).toBeUndefined();
      expect(
        properties.find((p) => p.name === 'getcontenttype'),
      ).toBeUndefined();
      expect(properties.find((p) => p.name === 'getetag')).toBeUndefined();
    });

    it("reports creationdate/getlastmodified from the resource's own timestamps", async () => {
      const properties = await new WebDavLiveProperties().listLiveProperties(
        makeCollection({
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-06-15T12:30:00.000Z'),
        }),
        FAKE_CONTEXT,
      );

      expect(properties.find((p) => p.name === 'creationdate')?.value).toBe(
        '2024-01-01T00:00:00.000Z',
      );
      expect(properties.find((p) => p.name === 'getlastmodified')?.value).toBe(
        new Date('2024-06-15T12:30:00.000Z').toUTCString(),
      );
    });

    it('does not report supportedlock/lockdiscovery — owned by LockPropertiesProvider (M4)', async () => {
      const properties = await new WebDavLiveProperties().listLiveProperties(
        makeCollection(),
        FAKE_CONTEXT,
      );

      expect(properties.find((p) => p.name === 'supportedlock')).toBeUndefined();
      expect(properties.find((p) => p.name === 'lockdiscovery')).toBeUndefined();
    });
  });

  describe('isLiveProperty', () => {
    it('returns true for a DAV: live property', () => {
      expect(new WebDavLiveProperties().isLiveProperty('DAV:', 'getetag')).toBe(
        true,
      );
    });

    it('returns false for a custom-namespace property', () => {
      expect(
        new WebDavLiveProperties().isLiveProperty(
          'http://example.com/custom',
          'foo',
        ),
      ).toBe(false);
    });

    it('returns false for an unknown DAV: property name', () => {
      expect(
        new WebDavLiveProperties().isLiveProperty(
          'DAV:',
          'not-a-real-property',
        ),
      ).toBe(false);
    });

    it('returns false for supportedlock/lockdiscovery — owned by LockPropertiesProvider (M4)', () => {
      const provider = new WebDavLiveProperties();
      expect(provider.isLiveProperty('DAV:', 'supportedlock')).toBe(false);
      expect(provider.isLiveProperty('DAV:', 'lockdiscovery')).toBe(false);
    });
  });
});
