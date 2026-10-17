import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  Tenant,
  TenantService,
  UserService,
  type DataSource,
} from '@davnode/core';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { DEFAULT_AUTH_CONFIG, type AuthConfig } from '../auth-config.js';
import type { SecurityConfig } from '../security/security-config.js';
import { digestAuthorization, parseChallenge } from './digest-test.util.js';

const PASSWORD = 'correct horse battery staple';
const ISSUER = 'https://idp.example.com';

describe('security hardening', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  let baseUrl: string;
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme',
    });
    await new UserService(dataSource, { digestRealm: 'davnode' }).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
      role: 'tenant_admin',
    });
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    await dataSource.destroy();
  });

  function start(
    security: Partial<SecurityConfig> = {},
    auth: AuthConfig = DEFAULT_AUTH_CONFIG,
  ): void {
    server = createApp(dataSource, {
      auth,
      security: {
        rateLimit: { max: 3, windowMs: 15 * 60_000 },
        behindTlsProxy: false,
        ...security,
      },
    }).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const basic = (password: string) =>
    `Basic ${Buffer.from(`alice:${password}`).toString('base64')}`;
  const get = (path: string, authorization?: string, headers = {}) =>
    fetch(`${baseUrl}${path}`, {
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        ...headers,
      },
    });
  // A route that answers 200 to a logged-in tenant_admin.
  const url = '/admin/acme/users';

  describe('rate limiting', () => {
    it('refuses the request after the allowed failures with 429 and Retry-After, even for the right password', async () => {
      start();
      for (let i = 0; i < 3; i += 1) {
        expect((await get(url, basic('wrong'))).status).toBe(401);
      }

      const blocked = await get(url, basic(PASSWORD));

      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(Number(blocked.headers.get('retry-after'))).toBeLessThanOrEqual(
        900,
      );
    });

    it('resets the counter after a successful login', async () => {
      start();
      await get(url, basic('wrong'));
      await get(url, basic('wrong'));
      expect((await get(url, basic(PASSWORD))).status).toBe(200);

      // Two more failures would have been the fourth and fifth without the reset.
      await get(url, basic('wrong'));
      await get(url, basic('wrong'));

      expect((await get(url, basic(PASSWORD))).status).toBe(200);
    });

    it('requests without credentials neither count nor are blocked early', async () => {
      start();
      for (let i = 0; i < 10; i += 1) {
        expect((await get(url)).status).toBe(401);
      }

      expect((await get(url, basic(PASSWORD))).status).toBe(200);
    });

    it('switching scheme does not give a fresh budget: Basic and Digest failures share one counter', async () => {
      start({}, { ...DEFAULT_AUTH_CONFIG, providers: ['basic', 'digest'] });
      const lines = await new Promise<string>((resolve, reject) => {
        http
          .get(`${baseUrl}${url}`, (res) => {
            const digest = res.rawHeaders.find((h) => h.startsWith('Digest '));
            res.resume();
            resolve(digest ?? '');
          })
          .on('error', reject);
      });
      const challenge = parseChallenge(lines);

      await get(url, basic('wrong'));
      await get(url, basic('wrong'));
      const wrongDigest = await get(
        url,
        digestAuthorization({
          challenge,
          username: 'alice',
          password: 'wrong',
          method: 'GET',
          uri: url,
        }),
      );
      expect(wrongDigest.status).toBe(401);

      expect((await get(url, basic(PASSWORD))).status).toBe(429);
    });

    it('also counts rejected bearer tokens, in the same budget', async () => {
      const pair = await generateKeyPair('RS256', { extractable: true });
      const jwks = {
        keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }],
      };
      globalThis.fetch = ((
        input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ) =>
        String(input).startsWith(ISSUER)
          ? Promise.resolve(Response.json(jwks))
          : realFetch(input, init)) as typeof fetch;
      start(
        {},
        {
          ...DEFAULT_AUTH_CONFIG,
          providers: ['basic', 'oauth2'],
          oauth2Issuers: [
            { issuer: ISSUER, audience: 'davnode', jwksUri: `${ISSUER}/jwks` },
          ],
        },
      );
      const stranger = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(ISSUER)
        .setAudience('davnode')
        .setSubject('unlinked')
        .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
        .sign(pair.privateKey);

      await get(url, `Bearer ${stranger}`);
      await get(url, `Bearer ${stranger}`);
      await get(url, basic('wrong'));

      expect((await get(url, basic(PASSWORD))).status).toBe(429);
    });

    it('shares one budget between the DAV routes and the discovery endpoint', async () => {
      start();
      for (let i = 0; i < 3; i += 1) {
        await fetch(`${baseUrl}/.well-known/caldav`, {
          headers: {
            Authorization: `Basic ${Buffer.from('alice@acme:wrong').toString('base64')}`,
          },
        });
      }

      expect((await get('/admin/acme/users', basic(PASSWORD))).status).toBe(
        429,
      );
      expect(
        (
          await fetch(`${baseUrl}/.well-known/caldav`, {
            headers: {
              Authorization: `Basic ${Buffer.from(`alice@acme:${PASSWORD}`).toString('base64')}`,
            },
          })
        ).status,
      ).toBe(429);
    });

    it('does not touch the health probe', async () => {
      start();
      for (let i = 0; i < 3; i += 1) await get(url, basic('wrong'));

      expect((await get('/healthz')).status).toBe(200);
    });

    it('can be switched off', async () => {
      start({ rateLimit: null });
      for (let i = 0; i < 20; i += 1) await get(url, basic('wrong'));

      expect((await get(url, basic(PASSWORD))).status).toBe(200);
    });
  });

  describe('client address behind a proxy', () => {
    it('without the proxy setting, X-Forwarded-For is ignored: one forged address cannot dodge the limit', async () => {
      start();
      for (let i = 0; i < 3; i += 1) {
        await get(url, basic('wrong'), { 'X-Forwarded-For': `9.9.9.${i}` });
      }

      expect(
        (await get(url, basic(PASSWORD), { 'X-Forwarded-For': '8.8.8.8' }))
          .status,
      ).toBe(429);
    });

    it('with the proxy setting, clients are told apart by the forwarded address', async () => {
      start({ behindTlsProxy: true });
      for (let i = 0; i < 3; i += 1) {
        await get(url, basic('wrong'), { 'X-Forwarded-For': '9.9.9.9' });
      }

      expect(
        (await get(url, basic(PASSWORD), { 'X-Forwarded-For': '9.9.9.9' }))
          .status,
      ).toBe(429);
      expect(
        (await get(url, basic(PASSWORD), { 'X-Forwarded-For': '7.7.7.7' }))
          .status,
      ).toBe(200);
    });
  });

  describe('security headers', () => {
    it.each([
      '/healthz',
      url,
      '/dav/acme/files/',
      '/admin/acme/users',
      '/.well-known/caldav',
      '/nowhere',
    ])(
      '%s carries the hardening headers and no CORS header, whatever the status',
      async (path) => {
        start();
        const response = await get(path, basic(PASSWORD), {
          Origin: 'https://evil.example',
        });

        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('x-frame-options')).toBe('DENY');
        expect(response.headers.get('referrer-policy')).toBe('no-referrer');
        expect(response.headers.get('strict-transport-security')).toBeNull();
        expect(response.headers.get('x-powered-by')).toBeNull();
        for (const [name] of response.headers) {
          expect(name.startsWith('access-control-')).toBe(false);
        }
      },
    );

    it('also on an unauthenticated 401 and on an OPTIONS preflight', async () => {
      start();
      const unauthenticated = await get(url);
      const preflight = await fetch(`${baseUrl}${url}`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.example',
          'Access-Control-Request-Method': 'PROPFIND',
        },
      });

      expect(unauthenticated.status).toBe(401);
      expect(unauthenticated.headers.get('x-frame-options')).toBe('DENY');
      expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
      expect(preflight.headers.get('x-frame-options')).toBe('DENY');
    });

    it('sends HSTS only behind the TLS proxy', async () => {
      start({ behindTlsProxy: true });

      const response = await get('/healthz');

      expect(response.headers.get('strict-transport-security')).toBe(
        'max-age=31536000',
      );
    });
  });
});
