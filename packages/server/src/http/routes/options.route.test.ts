import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  TenantService,
  UserService,
  type DataSource,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

const PASSWORD = 'correct horse battery staple';

describe('OPTIONS', () => {
  let dataSource: DataSource;
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
    await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    server = createApp(dataSource).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  const options = (path: string, authorization: string | null = auth) =>
    fetch(`${baseUrl}${path}`, {
      method: 'OPTIONS',
      headers: authorization ? { Authorization: authorization } : {},
    });

  const tokens = (value: string | null) =>
    (value ?? '').split(',').map((token) => token.trim());

  it.each([
    '/dav/acme/files/',
    '/dav/acme/files/deep/er/file.txt',
    '/dav/acme/calendars/some-id/work',
    '/dav/acme/addressbooks/some-id/book',
    '/dav/acme/principals/users/some-id',
    '/dav/acme/',
    '/dav/acme',
  ])(
    '%s answers 200 with MS-Author-Via: DAV and DAV classes 1 and 2',
    async (path) => {
      const response = await options(path);

      expect(response.status).toBe(200);
      expect(response.headers.get('ms-author-via')).toBe('DAV');
      expect(tokens(response.headers.get('dav'))).toEqual(
        expect.arrayContaining(['1', '2']),
      );
      expect(response.headers.get('content-length')).toBe('0');
    },
  );

  it('lists the full RFC 4918 and ACL method set for the file tree', async () => {
    const allow = tokens(
      (await options('/dav/acme/files/')).headers.get('allow'),
    );

    expect(allow).toEqual(
      expect.arrayContaining([
        'OPTIONS',
        'GET',
        'HEAD',
        'PUT',
        'DELETE',
        'PROPFIND',
        'PROPPATCH',
        'MKCOL',
        'COPY',
        'MOVE',
        'LOCK',
        'UNLOCK',
        'REPORT',
        'ACL',
      ]),
    );
    expect(allow).not.toContain('MKCALENDAR');
  });

  it('advertises MKCALENDAR and the CalDAV tokens only for calendars', async () => {
    const response = await options('/dav/acme/calendars/some-id/work');

    expect(tokens(response.headers.get('allow'))).toContain('MKCALENDAR');
    expect(tokens(response.headers.get('allow'))).not.toContain('COPY');
    expect(tokens(response.headers.get('dav'))).toEqual(
      expect.arrayContaining([
        'calendar-access',
        'calendar-auto-schedule',
        'access-control',
      ]),
    );
  });

  it('advertises extended MKCOL and the CardDAV token for addressbooks, not MKCALENDAR', async () => {
    const response = await options('/dav/acme/addressbooks/some-id/book');

    expect(tokens(response.headers.get('dav'))).toEqual(
      expect.arrayContaining(['addressbook', 'extended-mkcol']),
    );
    expect(tokens(response.headers.get('allow'))).not.toContain('MKCALENDAR');
  });

  it('shows discovery clients both CalDAV and CardDAV on the principal', async () => {
    const dav = tokens(
      (await options('/dav/acme/principals/users/x')).headers.get('dav'),
    );

    expect(dav).toEqual(
      expect.arrayContaining(['calendar-access', 'addressbook']),
    );
  });

  it('still requires authentication, like every other /dav route', async () => {
    const response = await options('/dav/acme/files/', null);

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toMatch(/^Basic/);
  });
});
