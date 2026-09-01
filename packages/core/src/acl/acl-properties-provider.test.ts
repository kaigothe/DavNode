import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create } from 'xmlbuilder2';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  Collection,
  CollectionAce,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';
import type { PropertyProviderContext } from '../webdav/properties/property-provider.interface.js';
import { toPrincipalUrl } from '../principals/principal-url.js';
import { AclPropertiesProvider } from './acl-properties-provider.js';
import { getCurrentUserPrivilegeSet } from './evaluate-privilege.js';
import { ALL_PRIVILEGES } from './privilege.js';

const PASSWORD = 'correct horse battery staple';

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

describe('AclPropertiesProvider', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: { principalId: string };
  let alicePrincipal: Principal;
  let root: Collection;
  let provider: AclPropertiesProvider;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    alice = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    alicePrincipal = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: alice.principalId });

    root = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: alice.principalId,
        displayName: 'root',
      }),
    );
    await dataSource.getRepository(CollectionAce).save(
      dataSource.getRepository(CollectionAce).create({
        collectionId: root.id,
        principalId: alice.principalId,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
        position: 0,
      }),
    );

    provider = new AclPropertiesProvider();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function context(): PropertyProviderContext {
    return { tenant, principal: alicePrincipal, manager: dataSource.manager };
  }

  it('DAV:owner reports the correct principal URL', async () => {
    const properties = await provider.listLiveProperties(root, context());
    const owner = properties.find((p) => p.name === 'owner');

    expect(owner?.value).toBe(
      `<D:href xmlns:D="DAV:">${toPrincipalUrl(alicePrincipal, tenant)}</D:href>`,
    );
  });

  it('DAV:current-user-privilege-set matches getCurrentUserPrivilegeSet', async () => {
    const properties = await provider.listLiveProperties(root, context());
    const currentUserPrivilegeSet = properties.find(
      (p) => p.name === 'current-user-privilege-set',
    );

    const expected = await getCurrentUserPrivilegeSet(
      dataSource.manager,
      alicePrincipal,
      root,
    );
    const reportedPrivilegeNames = localNames(
      currentUserPrivilegeSet?.value ?? '',
    ).filter((name) => name !== 'privilege');

    expect(reportedPrivilegeNames.sort()).toEqual([...expected].sort());
    // Sanity check against the AC's own literal expectation for the
    // default-owner ACE (all eleven catalog privileges).
    expect(reportedPrivilegeNames.sort()).toEqual([...ALL_PRIVILEGES].sort());
  });

  it('DAV:acl includes both direct and inherited ACEs, correctly marked protected/inherited', async () => {
    const sub = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: root.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'sub',
      }),
    );
    const bob = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    await dataSource.getRepository(CollectionAce).save(
      dataSource.getRepository(CollectionAce).create({
        collectionId: sub.id,
        principalId: bob.principalId,
        privilege: 'read',
        grantDeny: 'grant',
        protected: false,
        position: 0,
      }),
    );

    const properties = await provider.listLiveProperties(sub, context());
    const acl = properties.find((p) => p.name === 'acl');
    const aceElements = acl?.value.split('</D:ace>').filter((s) => s.trim());

    expect(aceElements).toHaveLength(2);
    // The sub collection's own (direct, non-protected) ACE.
    expect(aceElements?.[0]).toContain('D:read');
    expect(aceElements?.[0]).not.toContain('D:protected');
    expect(aceElements?.[0]).not.toContain('D:inherited');
    // The root's protected, inherited ACE.
    expect(aceElements?.[1]).toContain('D:all');
    expect(aceElements?.[1]).toContain('<D:protected/>');
    expect(aceElements?.[1]).toContain('<D:inherited>');
    expect(hrefTexts(aceElements?.[1] ?? '')).toContain(
      `/dav/${tenant.slug}/files`,
    );
  });

  it('DAV:current-user-principal always reports a concrete principal URL, never <D:unauthenticated/>', async () => {
    const properties = await provider.listLiveProperties(root, context());
    const currentUserPrincipal = properties.find(
      (p) => p.name === 'current-user-principal',
    );

    expect(currentUserPrincipal?.value).not.toContain('unauthenticated');
    expect(hrefTexts(currentUserPrincipal?.value ?? '')).toEqual([
      toPrincipalUrl(alicePrincipal, tenant),
    ]);
  });

  it('DAV:principal-collection-set points at the tenant principals collection', async () => {
    const properties = await provider.listLiveProperties(root, context());
    const principalCollectionSet = properties.find(
      (p) => p.name === 'principal-collection-set',
    );

    expect(hrefTexts(principalCollectionSet?.value ?? '')).toEqual([
      `/dav/${tenant.slug}/principals/`,
    ]);
  });

  it('DAV:supported-privilege-set describes the full aggregation tree', async () => {
    const properties = await provider.listLiveProperties(root, context());
    const supportedPrivilegeSet = properties.find(
      (p) => p.name === 'supported-privilege-set',
    );

    const names = localNames(supportedPrivilegeSet?.value ?? '');
    for (const privilege of ALL_PRIVILEGES) {
      expect(names).toContain(privilege);
    }
  });

  it('isLiveProperty recognizes exactly the ACL properties', () => {
    for (const name of [
      'owner',
      'supported-privilege-set',
      'current-user-privilege-set',
      'acl',
      'principal-collection-set',
      'current-user-principal',
    ]) {
      expect(provider.isLiveProperty('DAV:', name)).toBe(true);
    }
    expect(provider.isLiveProperty('DAV:', 'displayname')).toBe(false);
    expect(provider.isLiveProperty('http://example.com/', 'owner')).toBe(
      false,
    );
  });
});
