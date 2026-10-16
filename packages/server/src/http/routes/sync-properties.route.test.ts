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

const propfindBody = `<?xml version="1.0"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:supported-report-set/><D:sync-token/></D:prop></D:propfind>`;

describe('supported-report-set and sync-token', () => {
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

  const send = (method: string, path: string, body?: string, headers = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      body,
      headers: { Authorization: auth, ...headers },
    });

  async function props(path: string) {
    const response = await send('PROPFIND', path, propfindBody, {
      Depth: '0',
      'Content-Type': 'application/xml',
    });
    expect(response.status).toBe(207);
    const xml = await response.text();
    return {
      xml,
      reports: [...xml.matchAll(/<D:report><\w+:([\w-]+)/g)].map((m) => m[1]),
      token: /<D:sync-token>([^<]*)</.exec(xml)?.[1],
    };
  }

  const calendar = () => `/dav/acme/calendars/${alice.principalId}/work`;
  const book = () => `/dav/acme/addressbooks/${alice.principalId}/book`;

  it('a WebDAV collection supports sync-collection', async () => {
    await send('MKCOL', '/dav/acme/files/docs');

    const { reports, token } = await props('/dav/acme/files/docs');

    expect(reports).toEqual(['sync-collection']);
    expect(token).toMatch(/^davnode-sync:[0-9a-f-]{36}:\d+$/);
  });

  it('a calendar lists the CalDAV reports and sync-collection', async () => {
    await send('MKCALENDAR', calendar());

    const { reports } = await props(calendar());

    expect(reports).toEqual([
      'calendar-query',
      'calendar-multiget',
      'free-busy-query',
      'sync-collection',
    ]);
  });

  it('an addressbook lists the CardDAV reports and sync-collection', async () => {
    await send(
      'MKCOL',
      book(),
      `<?xml version="1.0"?><D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:set><D:prop><D:resourcetype><D:collection/><C:addressbook/></D:resourcetype></D:prop></D:set></D:mkcol>`,
      { 'Content-Type': 'application/xml' },
    );

    const { reports } = await props(book());

    expect(reports).toEqual([
      'addressbook-query',
      'addressbook-multiget',
      'sync-collection',
    ]);
  });

  it('the sync-token is the one a sync-collection REPORT returns, and changes with the content', async () => {
    await send('MKCALENDAR', calendar());
    const before = (await props(calendar())).token!;

    const report = await send(
      'REPORT',
      calendar(),
      `<?xml version="1.0"?><D:sync-collection xmlns:D="DAV:"><D:sync-token/><D:sync-level>1</D:sync-level><D:prop><D:getetag/></D:prop></D:sync-collection>`,
      { 'Content-Type': 'application/xml', Depth: '0' },
    );
    expect(await report.text()).toContain(
      `<D:sync-token>${before}</D:sync-token>`,
    );

    await send(
      'PUT',
      `${calendar()}/e.ics`,
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\nBEGIN:VEVENT\r\nUID:e1\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20260924T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
      { 'Content-Type': 'text/calendar' },
    );
    const after = (await props(calendar())).token!;

    expect(after).not.toBe(before);
    // A client can start an incremental sync from the property value.
    const incremental = await send(
      'REPORT',
      calendar(),
      `<?xml version="1.0"?><D:sync-collection xmlns:D="DAV:"><D:sync-token>${before}</D:sync-token><D:sync-level>1</D:sync-level><D:prop><D:getetag/></D:prop></D:sync-collection>`,
      { 'Content-Type': 'application/xml', Depth: '0' },
    );
    expect(incremental.status).toBe(207);
    expect(await incremental.text()).toContain('e.ics');
  });

  it('files and events report neither property', async () => {
    await send('PUT', '/dav/acme/files/a.txt', 'x', {
      'Content-Type': 'text/plain',
    });

    const { xml } = await props('/dav/acme/files/a.txt');

    expect(xml).toContain('404 Not Found');
    expect(xml).not.toContain('davnode-sync');
  });

  it('both are protected against PROPPATCH', async () => {
    await send('MKCOL', '/dav/acme/files/docs');

    const response = await send(
      'PROPPATCH',
      '/dav/acme/files/docs',
      `<?xml version="1.0"?><D:propertyupdate xmlns:D="DAV:"><D:set><D:prop><D:sync-token>x</D:sync-token><D:supported-report-set/></D:prop></D:set></D:propertyupdate>`,
      { 'Content-Type': 'application/xml' },
    );

    expect(response.status).toBe(207);
    expect(await response.text()).toMatch(
      /403|cannot-modify-protected-property/,
    );
  });
});
