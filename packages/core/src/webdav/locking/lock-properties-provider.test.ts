import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create } from 'xmlbuilder2';
import { createDataSource } from '../../db/data-source.js';
import {
  ALL_ENTITIES,
  Collection,
  CollectionLock,
  FileResource,
  Principal,
  Tenant,
} from '../../entities/index.js';
import { ALL_MIGRATIONS } from '../../migrations/sqlite/index.js';
import type { PropertyProviderContext } from '../properties/property-provider.interface.js';
import { LockPropertiesProvider } from './lock-properties-provider.js';

/** Local-names of every element found anywhere in `xml`. */
function localNames(xml: string): string[] {
  const names: string[] = [];
  const root = create(`<x>${xml}</x>`).root();
  const collect = (node: ReturnType<typeof root.first>): void => {
    node.each((child) => {
      names.push(child.node.localName);
      collect(child);
    });
  };
  collect(root);
  return names;
}

/** Text content of every `<D:href>` element found anywhere in `xml`. */
function hrefTexts(xml: string): string[] {
  const hrefs: string[] = [];
  const root = create(`<x>${xml}</x>`).root();
  const collect = (node: ReturnType<typeof root.first>): void => {
    node.each((child) => {
      if (child.node.localName === 'href') {
        hrefs.push(child.node.textContent ?? '');
      }
      collect(child);
    });
  };
  collect(root);
  return hrefs;
}

describe('LockPropertiesProvider', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let principal: Principal;
  let root: Collection;
  let provider: LockPropertiesProvider;
  let context: PropertyProviderContext;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    const savedTenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    tenant = savedTenant;
    principal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    root = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: principal.id,
        displayName: 'root',
      }),
    );

    provider = new LockPropertiesProvider();
    context = { tenant, principal, manager: dataSource.manager };
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('reports an empty lockdiscovery for an unlocked resource', async () => {
    const properties = await provider.listLiveProperties(root, context);

    const lockdiscovery = properties.find((p) => p.name === 'lockdiscovery');
    expect(lockdiscovery?.value).toBe('');
  });

  it('reports a single activelock with the correct locktoken for a directly locked resource', async () => {
    const lock = await dataSource.getRepository(CollectionLock).save(
      dataSource.getRepository(CollectionLock).create({
        collectionId: root.id,
        principalId: principal.id,
        token: 'urn:uuid:11111111-1111-1111-1111-111111111111',
        scope: 'exclusive',
        depth: 'infinity',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );

    const properties = await provider.listLiveProperties(root, context);
    const lockdiscovery = properties.find((p) => p.name === 'lockdiscovery');

    expect(localNames(lockdiscovery!.value).filter((n) => n === 'activelock')).toHaveLength(1);
    expect(lockdiscovery!.value).toContain(lock.token);
  });

  it('resolves lockroot to the ancestor collection for an inherited Depth: infinity lock, not the queried resource', async () => {
    const sub = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: root.id,
        ownerPrincipalId: principal.id,
        displayName: 'sub',
      }),
    );
    const doc = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: sub.id,
        name: 'doc.txt',
        contentType: 'text/plain',
        etag: 'etag-1',
        sizeBytes: 1,
        ownerPrincipalId: principal.id,
      }),
    );
    await dataSource.getRepository(CollectionLock).save(
      dataSource.getRepository(CollectionLock).create({
        collectionId: root.id,
        principalId: principal.id,
        token: 'urn:uuid:22222222-2222-2222-2222-222222222222',
        scope: 'exclusive',
        depth: 'infinity',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );

    const properties = await provider.listLiveProperties(doc, context);
    const lockdiscovery = properties.find((p) => p.name === 'lockdiscovery');

    expect(hrefTexts(lockdiscovery!.value)).toContain('/dav/acme/files');
    expect(hrefTexts(lockdiscovery!.value)).not.toContain(
      '/dav/acme/files/sub/doc.txt',
    );
  });

  it('supportedlock lists both exclusive/write and shared/write lockentry combinations', async () => {
    const properties = await provider.listLiveProperties(root, context);
    const supportedlock = properties.find((p) => p.name === 'supportedlock');

    const names = localNames(supportedlock!.value);
    expect(names.filter((n) => n === 'lockentry')).toHaveLength(2);
    expect(names).toContain('exclusive');
    expect(names).toContain('shared');
    expect(names.filter((n) => n === 'write')).toHaveLength(2);
  });

  describe('isLiveProperty', () => {
    it('claims DAV:supportedlock and DAV:lockdiscovery', () => {
      expect(provider.isLiveProperty('DAV:', 'supportedlock')).toBe(true);
      expect(provider.isLiveProperty('DAV:', 'lockdiscovery')).toBe(true);
    });

    it('does not claim an unrelated property', () => {
      expect(provider.isLiveProperty('DAV:', 'getetag')).toBe(false);
    });
  });
});
