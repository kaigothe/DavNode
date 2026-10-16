import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionAce,
  createDataSource,
  TenantService,
  UserService,
  type DataSource,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

const PASSWORD = 'correct horse battery staple';

const body = (...props: string[]) => `<?xml version="1.0"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="urn:ietf:params:xml:ns:carddav">
  <D:prop>${props.map((p) => `<${p}/>`).join('')}</D:prop>
</D:propfind>`;

describe('client discovery properties', () => {
  let dataSource: DataSource;
  let alice: User;
  let bob: User;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    const tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme & Sons',
    });
    const users = new UserService(dataSource);
    alice = await users.createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    bob = await users.createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    const root = await dataSource.getRepository(Collection).save({
      tenantId: tenant.id,
      parentCollectionId: null,
      ownerPrincipalId: alice.principalId,
      displayName: 'files',
    });
    await dataSource.getRepository(CollectionAce).save({
      collectionId: root.id,
      principalId: alice.principalId,
      privilege: 'all',
      grantDeny: 'grant',
      position: 0,
    });
    server = createApp(dataSource).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  const as = (user: string) =>
    `Basic ${Buffer.from(`${user}:${PASSWORD}`).toString('base64')}`;

  const propfind = (
    path: string,
    props: string[],
    options: { depth?: string; user?: string } = {},
  ) =>
    fetch(`${baseUrl}${path}`, {
      method: 'PROPFIND',
      headers: {
        Authorization: as(options.user ?? 'alice'),
        Depth: options.depth ?? '0',
        'Content-Type': 'application/xml',
      },
      body: body(...props),
    });

  const hrefOf = (xml: string, property: string) =>
    new RegExp(`<[^>]*${property}[^>]*><[^>]*href[^>]*>([^<]*)</`).exec(
      xml,
    )?.[1];

  const principalUrl = (user: User) =>
    `/dav/acme/principals/users/${user.principalId}`;

  describe('the tenant root', () => {
    it.each(['/dav/acme', '/dav/acme/'])(
      '%s answers PROPFIND with the current user principal and the principal collection',
      async (path) => {
        const response = await propfind(path, [
          'D:current-user-principal',
          'D:principal-collection-set',
          'D:resourcetype',
          'D:displayname',
        ]);

        expect(response.status).toBe(207);
        const xml = await response.text();
        expect(hrefOf(xml, 'current-user-principal')).toBe(principalUrl(alice));
        expect(hrefOf(xml, 'principal-collection-set')).toBe(
          '/dav/acme/principals/',
        );
        expect(xml).toContain('<D:collection');
        expect(xml).toContain('Acme &amp; Sons');
        expect(xml).not.toContain('404 Not Found');
      },
    );

    it('tells each user their own principal', async () => {
      const xml = await (
        await propfind('/dav/acme/', ['D:current-user-principal'], {
          user: 'bob',
        })
      ).text();

      expect(hrefOf(xml, 'current-user-principal')).toBe(principalUrl(bob));
    });

    it('lists the four trees at Depth 1', async () => {
      const xml = await (
        await propfind('/dav/acme/', ['D:resourcetype'], { depth: '1' })
      ).text();

      for (const tree of ['files', 'calendars', 'addressbooks', 'principals']) {
        expect(xml).toContain(`<D:href>/dav/acme/${tree}/</D:href>`);
      }
    });

    it('rejects Depth infinity and a missing Depth with 403', async () => {
      expect(
        (
          await propfind('/dav/acme/', ['D:resourcetype'], {
            depth: 'infinity',
          })
        ).status,
      ).toBe(403);
    });

    it('requires authentication', async () => {
      const response = await fetch(`${baseUrl}/dav/acme/`, {
        method: 'PROPFIND',
        headers: { Depth: '0' },
      });

      expect(response.status).toBe(401);
    });
  });

  it.each([
    ['the file tree', '/dav/acme/files'],
    ['the calendar home', () => `/dav/acme/calendars/${alice.principalId}`],
    [
      'the addressbook home',
      () => `/dav/acme/addressbooks/${alice.principalId}`,
    ],
    ['the principals collection', '/dav/acme/principals'],
    ['a principal', () => principalUrl(alice)],
  ])(
    '%s also reports current-user-principal and principal-collection-set',
    async (_name, path) => {
      const resolved = typeof path === 'function' ? path() : path;

      const xml = await (
        await propfind(resolved, [
          'D:current-user-principal',
          'D:principal-collection-set',
        ])
      ).text();

      expect(hrefOf(xml, 'current-user-principal')).toBe(principalUrl(alice));
      expect(hrefOf(xml, 'principal-collection-set')).toBe(
        '/dav/acme/principals/',
      );
    },
  );

  it('a principal reports its own URL as DAV:principal-URL', async () => {
    const xml = await (
      await propfind(principalUrl(bob), ['D:principal-URL'])
    ).text();

    expect(hrefOf(xml, 'principal-URL')).toBe(principalUrl(bob));
  });

  it('the discovery chain works end to end: root, principal, then the home sets', async () => {
    const root = await (
      await propfind('/dav/acme/', ['D:current-user-principal'])
    ).text();
    const principal = hrefOf(root, 'current-user-principal')!;

    const homes = await (
      await propfind(principal, [
        'C:calendar-home-set',
        'A:addressbook-home-set',
      ])
    ).text();

    expect(hrefOf(homes, 'calendar-home-set')).toBe(
      `/dav/acme/calendars/${alice.principalId}`,
    );
    expect(hrefOf(homes, 'addressbook-home-set')).toBe(
      `/dav/acme/addressbooks/${alice.principalId}`,
    );
  });

  it('the properties are protected against PROPPATCH', async () => {
    const response = await fetch(`${baseUrl}/dav/acme/files`, {
      method: 'PROPPATCH',
      headers: {
        Authorization: as('alice'),
        'Content-Type': 'application/xml',
      },
      body: `<?xml version="1.0"?><D:propertyupdate xmlns:D="DAV:"><D:set><D:prop><D:current-user-principal><D:href>/x</D:href></D:current-user-principal></D:prop></D:set></D:propertyupdate>`,
    });

    expect(response.status).toBe(207);
    expect(await response.text()).toMatch(
      /403|cannot-modify-protected-property/,
    );
  });
});
