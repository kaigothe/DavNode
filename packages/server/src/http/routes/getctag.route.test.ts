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
const CTAG = '{http://calendarserver.org/ns/}getctag';

const propfindBody = `<?xml version="1.0"?>
<D:propfind xmlns:D="DAV:" xmlns:CS="http://calendarserver.org/ns/">
  <D:prop><CS:getctag/></D:prop>
</D:propfind>`;

const ics = (uid: string) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    'DTSTART:20260924T100000Z',
    'SUMMARY:Meeting',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

const vcard = (uid: string) =>
  [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Zoe Example',
    'N:Example;Zoe;;;',
    `UID:${uid}`,
    'END:VCARD',
    '',
  ].join('\r\n');

describe('getctag live property', () => {
  let dataSource: DataSource;
  let alice: User;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;
  let baseUrl: string;
  const auth = `Basic ${Buffer.from(`alice:${PASSWORD}`).toString('base64')}`;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    const tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme',
    });
    alice = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
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

  const send = (
    method: string,
    path: string,
    body?: string,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${baseUrl}${path}`, {
      method,
      body,
      headers: { Authorization: auth, ...headers },
    });

  /** The getctag of the resource at `path` (Depth 0), or `null` if absent. */
  async function ctag(path: string): Promise<string | null> {
    const response = await send('PROPFIND', path, propfindBody, {
      Depth: '0',
      'Content-Type': 'application/xml',
    });
    expect(response.status).toBe(207);
    const xml = await response.text();
    if (xml.includes('404 Not Found')) {
      return null;
    }
    return new RegExp(`<[^>]*:?getctag[^>]*>([^<]*)</`).exec(xml)?.[1] ?? null;
  }

  const trees = [
    {
      name: 'a WebDAV collection',
      path: '/dav/acme/files/docs',
      create: () => send('MKCOL', '/dav/acme/files/docs'),
      change: () =>
        send('PUT', '/dav/acme/files/docs/a.txt', 'hello', {
          'Content-Type': 'text/plain',
        }),
    },
    {
      name: 'a calendar',
      path: () => `/dav/acme/calendars/${alice.principalId}/work`,
      create: () =>
        send('MKCALENDAR', `/dav/acme/calendars/${alice.principalId}/work`),
      change: () =>
        send(
          'PUT',
          `/dav/acme/calendars/${alice.principalId}/work/e.ics`,
          ics('e1'),
          {
            'Content-Type': 'text/calendar',
          },
        ),
    },
    {
      name: 'an addressbook',
      path: () => `/dav/acme/addressbooks/${alice.principalId}/book`,
      create: () =>
        send(
          'MKCOL',
          `/dav/acme/addressbooks/${alice.principalId}/book`,
          `<?xml version="1.0"?><D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:set><D:prop><D:resourcetype><D:collection/><C:addressbook/></D:resourcetype></D:prop></D:set></D:mkcol>`,
          { 'Content-Type': 'application/xml' },
        ),
      change: () =>
        send(
          'PUT',
          `/dav/acme/addressbooks/${alice.principalId}/book/z.vcf`,
          vcard('z1'),
          {
            'Content-Type': 'text/vcard',
          },
        ),
    },
  ];

  it.each(trees)(
    'is served for $name and changes with its content',
    async (tree) => {
      expect((await tree.create()).status).toBe(201);
      const path = typeof tree.path === 'function' ? tree.path() : tree.path;

      const before = await ctag(path);
      expect(before).toMatch(/^\d+$/);
      expect(await ctag(path)).toBe(before);

      expect((await tree.change()).status).toBe(201);
      const after = await ctag(path);

      expect(after).toMatch(/^\d+$/);
      expect(after).not.toBe(before);
    },
  );

  it('is not served for a file', async () => {
    await send('PUT', '/dav/acme/files/a.txt', 'x', {
      'Content-Type': 'text/plain',
    });

    expect(await ctag('/dav/acme/files/a.txt')).toBeNull();
  });

  it('is protected: PROPPATCH cannot set it', async () => {
    await send('MKCOL', '/dav/acme/files/docs');
    const response = await send(
      'PROPPATCH',
      '/dav/acme/files/docs',
      `<?xml version="1.0"?><D:propertyupdate xmlns:D="DAV:" xmlns:CS="http://calendarserver.org/ns/"><D:set><D:prop><CS:getctag>1</CS:getctag></D:prop></D:set></D:propertyupdate>`,
      { 'Content-Type': 'application/xml' },
    );

    expect(response.status).toBe(207);
    expect(await response.text()).toMatch(
      /403|cannot-modify-protected-property/,
    );
  });

  it('exposes the namespaced name used by clients', () => {
    expect(CTAG).toBe('{http://calendarserver.org/ns/}getctag');
  });
});
