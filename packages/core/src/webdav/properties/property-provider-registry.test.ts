import type { EntityManager } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { Collection } from '../../entities/collection.entity.js';
import type { Principal } from '../../entities/principal.entity.js';
import type { Tenant } from '../../entities/tenant.entity.js';
import { PropertyProviderRegistry } from './property-provider-registry.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
  WebDavResource,
} from './property-provider.interface.js';
import { WebDavLiveProperties } from './webdav-live-properties.js';

function makeCollection(): Collection {
  return Object.assign(new Collection(), {
    id: 'collection-1',
    tenantId: 'tenant-1',
    parentCollectionId: null,
    ownerPrincipalId: 'principal-1',
    displayName: 'My Folder',
    syncSeq: 0,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-06-15T12:30:00.000Z'),
  });
}

/** Neither provider under test reads `context` — this stands in for one none of them will actually touch. */
const FAKE_CONTEXT: PropertyProviderContext = {
  tenant: { id: 'tenant-1', slug: 'acme' } as Tenant,
  principal: { id: 'principal-1' } as Principal,
  manager: {} as EntityManager,
};

/**
 * A minimal stand-in for a future provider (e.g. M3's ACL properties),
 * proving the registry doesn't need to know about a provider's
 * concrete type ahead of time.
 */
class DummyPropertyProvider implements PropertyProvider {
  async listLiveProperties(_resource: WebDavResource): Promise<PropertyValue[]> {
    return [
      {
        namespace: 'http://example.com/dummy',
        name: 'dummy-property',
        value: 'dummy-value',
      },
    ];
  }

  isLiveProperty(namespace: string, name: string): boolean {
    return (
      namespace === 'http://example.com/dummy' && name === 'dummy-property'
    );
  }
}

describe('PropertyProviderRegistry', () => {
  it('returns no properties and no live-property matches with nothing registered', async () => {
    const registry = new PropertyProviderRegistry();

    await expect(
      registry.listLiveProperties(makeCollection(), FAKE_CONTEXT),
    ).resolves.toEqual([]);
    expect(registry.isLiveProperty('DAV:', 'displayname')).toBe(false);
  });

  it('delegates to a single registered provider', async () => {
    const registry = new PropertyProviderRegistry();
    registry.register(new WebDavLiveProperties());

    const properties = await registry.listLiveProperties(
      makeCollection(),
      FAKE_CONTEXT,
    );

    expect(properties.some((p) => p.name === 'resourcetype')).toBe(true);
    expect(registry.isLiveProperty('DAV:', 'getetag')).toBe(true);
  });

  it('merges properties from multiple registered providers (extensibility for M3+)', async () => {
    const registry = new PropertyProviderRegistry();
    registry.register(new WebDavLiveProperties());
    registry.register(new DummyPropertyProvider());

    const properties = await registry.listLiveProperties(
      makeCollection(),
      FAKE_CONTEXT,
    );

    expect(properties.some((p) => p.name === 'displayname')).toBe(true);
    expect(properties).toContainEqual({
      namespace: 'http://example.com/dummy',
      name: 'dummy-property',
      value: 'dummy-value',
    });
  });

  it('treats a namespace/name as live if any registered provider does', () => {
    const registry = new PropertyProviderRegistry();
    registry.register(new WebDavLiveProperties());
    registry.register(new DummyPropertyProvider());

    expect(registry.isLiveProperty('DAV:', 'getetag')).toBe(true);
    expect(
      registry.isLiveProperty('http://example.com/dummy', 'dummy-property'),
    ).toBe(true);
    expect(registry.isLiveProperty('http://example.com/other', 'foo')).toBe(
      false,
    );
  });
});
