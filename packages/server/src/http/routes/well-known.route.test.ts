import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  TenantService,
  UserService,
  type DataSource,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

const PASSWORD = 'correct horse battery staple';

describe('RFC 6764 well-known discovery', () => {
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
    const tenants = new TenantService(dataSource);
    const acme = await tenants.createTenant({ slug: 'acme', name: 'Acme' });
    const other = await tenants.createTenant({ slug: 'other', name: 'Other' });
    const users = new UserService(dataSource);
    alice = await users.createUser({
      tenantId: acme.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    // Same username in a second tenant, and an e-mail style username.
    bob = await users.createUser({
      tenantId: other.id,
      username: 'alice',
      email: 'alice2@example.com',
      password: 'other-password',
    });
    await users.createUser({
      tenantId: acme.id,
      username: 'carol@example.com',
      email: 'carol@example.com',
      password: PASSWORD,
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  function start(defaultTenant?: string): void {
    server = createApp(dataSource, { defaultTenant }).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const basic = (login: string, password = PASSWORD) =>
    `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;

  const discover = (
    path: string,
    authorization?: string,
    method = 'GET',
  ): Promise<Response> =>
    fetch(`${baseUrl}${path}`, {
      method,
      redirect: 'manual',
      headers: authorization ? { Authorization: authorization } : {},
    });

  describe('with a default tenant', () => {
    beforeEach(() => start('acme'));

    it('redirects caldav and carddav to the user principal URL with 302', async () => {
      for (const path of ['/.well-known/caldav', '/.well-known/carddav']) {
        const response = await discover(path, basic('alice'));

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe(
          `/dav/acme/principals/users/${alice.principalId}`,
        );
      }
    });

    it('answers PROPFIND the same way', async () => {
      const response = await discover(
        '/.well-known/caldav',
        basic('alice'),
        'PROPFIND',
      );

      expect(response.status).toBe(302);
    });

    it('keeps an e-mail style username intact', async () => {
      const response = await discover(
        '/.well-known/caldav',
        basic('carol@example.com'),
      );

      expect(response.status).toBe(302);
    });

    it('asks for Basic credentials when none are sent', async () => {
      const response = await discover('/.well-known/caldav');

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        'Basic realm="davnode"',
      );
    });

    it('answers a wrong password and an unknown user alike with 401', async () => {
      const wrong = await discover(
        '/.well-known/caldav',
        basic('alice', 'nope'),
      );
      const unknown = await discover('/.well-known/caldav', basic('ghost'));

      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.headers.get('www-authenticate')).toBe(
        unknown.headers.get('www-authenticate'),
      );
    });
  });

  describe('without a default tenant', () => {
    beforeEach(() => start());

    it('resolves user@tenantSlug to that tenant, also for a name that exists in several', async () => {
      const inAcme = await discover('/.well-known/caldav', basic('alice@acme'));
      const inOther = await discover(
        '/.well-known/caldav',
        basic('alice@other', 'other-password'),
      );

      expect(inAcme.headers.get('location')).toBe(
        `/dav/acme/principals/users/${alice.principalId}`,
      );
      expect(inOther.headers.get('location')).toBe(
        `/dav/other/principals/users/${bob.principalId}`,
      );
    });

    it('splits at the last @, so e-mail usernames work as mail@host@tenant', async () => {
      const response = await discover(
        '/.well-known/carddav',
        basic('carol@example.com@acme'),
      );

      expect(response.status).toBe(302);
    });

    it('answers a login without @ with 400', async () => {
      const response = await discover('/.well-known/caldav', basic('alice'));

      expect(response.status).toBe(400);
    });

    it('answers an unknown tenant, empty parts and a wrong password with 401', async () => {
      for (const login of ['alice@nowhere', 'alice@', '@acme']) {
        expect(
          (await discover('/.well-known/caldav', basic(login))).status,
        ).toBe(401);
      }
      expect(
        (await discover('/.well-known/caldav', basic('alice@acme', 'nope')))
          .status,
      ).toBe(401);
    });
  });

  it('follows the redirect into the DAV tree: the principal URL answers a PROPFIND', async () => {
    start('acme');
    const redirect = await discover('/.well-known/caldav', basic('alice'));

    const response = await fetch(
      `${baseUrl}${redirect.headers.get('location')}`,
      {
        method: 'PROPFIND',
        headers: { Authorization: basic('alice'), Depth: '0' },
      },
    );

    expect(response.status).toBe(207);
  });
});
