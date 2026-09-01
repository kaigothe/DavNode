import { describe, expect, it } from 'vitest';
import { Collection } from '../../entities/collection.entity.js';
import { FileResource } from '../../entities/file-resource.entity.js';
import { WebDavLiveProperties } from './webdav-live-properties.js';

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
    it('reports resourcetype = <D:collection/> for a Collection', () => {
      const properties = new WebDavLiveProperties().listLiveProperties(
        makeCollection(),
      );

      const resourcetype = properties.find((p) => p.name === 'resourcetype');
      expect(resourcetype).toEqual({
        namespace: 'DAV:',
        name: 'resourcetype',
        value: '<D:collection xmlns:D="DAV:"/>',
      });
    });

    it('reports an empty resourcetype for a FileResource', () => {
      const properties = new WebDavLiveProperties().listLiveProperties(
        makeFileResource(),
      );

      const resourcetype = properties.find((p) => p.name === 'resourcetype');
      expect(resourcetype).toEqual({
        namespace: 'DAV:',
        name: 'resourcetype',
        value: '',
      });
    });

    it('derives displayname from Collection.displayName', () => {
      const properties = new WebDavLiveProperties().listLiveProperties(
        makeCollection({ displayName: 'Tom & Jerry' }),
      );

      expect(properties.find((p) => p.name === 'displayname')).toEqual({
        namespace: 'DAV:',
        name: 'displayname',
        value: 'Tom &amp; Jerry',
      });
    });

    it('derives displayname from FileResource.name', () => {
      const properties = new WebDavLiveProperties().listLiveProperties(
        makeFileResource({ name: 'report <final>.txt' }),
      );

      expect(properties.find((p) => p.name === 'displayname')).toEqual({
        namespace: 'DAV:',
        name: 'displayname',
        value: 'report &lt;final&gt;.txt',
      });
    });

    it('derives getcontentlength/getcontenttype/getetag for a FileResource', () => {
      const properties = new WebDavLiveProperties().listLiveProperties(
        makeFileResource({
          sizeBytes: 42,
          contentType: 'text/plain',
          etag: '"xyz"',
        }),
      );

      expect(properties.find((p) => p.name === 'getcontentlength')?.value).toBe(
        '42',
      );
      expect(properties.find((p) => p.name === 'getcontenttype')?.value).toBe(
        'text/plain',
      );
      expect(properties.find((p) => p.name === 'getetag')?.value).toBe('"xyz"');
    });

    it('omits file-only properties for a Collection', () => {
      const properties = new WebDavLiveProperties().listLiveProperties(
        makeCollection(),
      );

      expect(
        properties.find((p) => p.name === 'getcontentlength'),
      ).toBeUndefined();
      expect(
        properties.find((p) => p.name === 'getcontenttype'),
      ).toBeUndefined();
      expect(properties.find((p) => p.name === 'getetag')).toBeUndefined();
    });

    it("reports creationdate/getlastmodified from the resource's own timestamps", () => {
      const properties = new WebDavLiveProperties().listLiveProperties(
        makeCollection({
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-06-15T12:30:00.000Z'),
        }),
      );

      expect(properties.find((p) => p.name === 'creationdate')?.value).toBe(
        '2024-01-01T00:00:00.000Z',
      );
      expect(properties.find((p) => p.name === 'getlastmodified')?.value).toBe(
        new Date('2024-06-15T12:30:00.000Z').toUTCString(),
      );
    });

    it('reports empty supportedlock/lockdiscovery (no real locking until M4)', () => {
      const properties = new WebDavLiveProperties().listLiveProperties(
        makeCollection(),
      );

      expect(properties.find((p) => p.name === 'supportedlock')?.value).toBe(
        '',
      );
      expect(properties.find((p) => p.name === 'lockdiscovery')?.value).toBe(
        '',
      );
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
  });
});
