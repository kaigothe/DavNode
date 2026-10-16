import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  DigestNonceStore,
  Tenant,
  TenantService,
  User,
  UserService,
  type DataSource,
} from '@davnode/core';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuthTerminator } from './auth-chain.js';
import { createBasicAuthMiddleware } from './basic-auth.middleware.js';
import { createDigestChallengeFactory } from './digest-auth-challenge.js';
import {
  createDigestAuthMiddleware,
  parseDigestAuthorization,
} from './digest-auth.middleware.js';
import { digestAuthorization, parseChallenge } from './digest-test.util.js';

const PASSWORD = 'correct horse battery staple';
const REALM = 'davnode';

describe('Digest auth over HTTP', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let now: number;
  let nonces: DigestNonceStore;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    alice = await new UserService(dataSource, {
      digestRealm: REALM,
    }).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    now = 1_000_000;
    nonces = new DigestNonceStore({ ttlMs: 1000, now: () => now });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  /** Mounts the middleware(s) on `/dav/:tenantSlug/*` and a handler echoing the principal. */
  function start(mode: 'digest' | 'chained'): void {
    const app = express();
    app.use((req, _res, next) => {
      req.tenant = tenant;
      next();
    });
    const challenges = createDigestChallengeFactory(nonces, REALM);
    if (mode === 'digest') {
      app.use(createDigestAuthMiddleware(dataSource, nonces, challenges));
    } else {
      app.use(createBasicAuthMiddleware(dataSource, { chained: true }));
      app.use(
        createDigestAuthMiddleware(dataSource, nonces, challenges, {
          chained: true,
        }),
      );
      app.use(createAuthTerminator());
    }
    app.all('/dav/acme/*splat', (req, res) => {
      res.json({ principalId: req.principal?.id });
    });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const uri = '/dav/acme/files/a.txt';

  async function challenge(): Promise<Record<string, string>> {
    const response = await fetch(`${baseUrl}${uri}`);
    expect(response.status).toBe(401);
    return parseChallenge(response.headers.get('www-authenticate')!);
  }

  const get = (authorization: string, method = 'GET') =>
    fetch(`${baseUrl}${uri}`, {
      method,
      headers: { Authorization: authorization },
    });

  describe('challenge', () => {
    beforeEach(() => start('digest'));

    it('answers a request without Authorization with a complete SHA-256 challenge', async () => {
      const response = await fetch(`${baseUrl}${uri}`);

      expect(response.status).toBe(401);
      const header = response.headers.get('www-authenticate')!;
      expect(header).toMatch(/^Digest /);
      expect(parseChallenge(header)).toMatchObject({
        realm: REALM,
        qop: 'auth',
        algorithm: 'SHA-256',
      });
      expect(parseChallenge(header)['nonce']).toMatch(/^[0-9a-f]{32}$/);
      expect(parseChallenge(header)['opaque']).toMatch(/^[0-9a-f]{32}$/);
      expect(header).not.toContain('stale');
      expect(header).not.toMatch(/md5/i);
    });

    it('hands out a different nonce with every challenge but the same opaque', async () => {
      const first = await challenge();
      const second = await challenge();

      expect(first['nonce']).not.toBe(second['nonce']);
      expect(first['opaque']).toBe(second['opaque']);
    });
  });

  describe('response validation', () => {
    beforeEach(() => start('digest'));

    it('authenticates a correct request and sets the principal', async () => {
      const c = await challenge();

      const response = await get(
        digestAuthorization({
          challenge: c,
          username: 'alice',
          password: PASSWORD,
          method: 'GET',
          uri,
        }),
      );

      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { principalId: string }).principalId,
      ).toBe(alice.principalId);
    });

    it('allows a client to reuse a nonce with increasing nc', async () => {
      const c = await challenge();
      const request = (nc: number) =>
        get(
          digestAuthorization({
            challenge: c,
            username: 'alice',
            password: PASSWORD,
            method: 'GET',
            uri,
            nc,
          }),
        );

      expect((await request(1)).status).toBe(200);
      expect((await request(2)).status).toBe(200);
    });

    it('rejects a replay of the same nonce and nc, even though the response is correct', async () => {
      const c = await challenge();
      const header = digestAuthorization({
        challenge: c,
        username: 'alice',
        password: PASSWORD,
        method: 'GET',
        uri,
      });
      expect((await get(header)).status).toBe(200);

      const replay = await get(header);

      expect(replay.status).toBe(401);
      expect(replay.headers.get('www-authenticate')).not.toContain('stale');
    });

    it('answers a wrong response with a fresh challenge without stale=true', async () => {
      const c = await challenge();

      const response = await get(
        digestAuthorization({
          challenge: c,
          username: 'alice',
          password: 'wrong',
          method: 'GET',
          uri,
        }),
      );

      expect(response.status).toBe(401);
      const header = response.headers.get('www-authenticate')!;
      expect(header).toMatch(/^Digest /);
      expect(header).not.toContain('stale');
      expect(parseChallenge(header)['nonce']).not.toBe(c['nonce']);
    });

    it('answers an expired nonce with stale=true, even for a correct response', async () => {
      const c = await challenge();
      now += 1000;

      const response = await get(
        digestAuthorization({
          challenge: c,
          username: 'alice',
          password: PASSWORD,
          method: 'GET',
          uri,
        }),
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain('stale=true');
    });

    it('a stale response lets the client retry transparently with the fresh nonce', async () => {
      const c = await challenge();
      now += 1000;
      const stale = await get(
        digestAuthorization({
          challenge: c,
          username: 'alice',
          password: PASSWORD,
          method: 'GET',
          uri,
        }),
      );
      const fresh = parseChallenge(stale.headers.get('www-authenticate')!);

      const retry = await get(
        digestAuthorization({
          challenge: fresh,
          username: 'alice',
          password: PASSWORD,
          method: 'GET',
          uri,
        }),
      );

      expect(retry.status).toBe(200);
    });

    it('answers an unknown nonce with a fresh challenge without stale', async () => {
      const response = await get(
        digestAuthorization({
          challenge: { realm: REALM, nonce: 'f'.repeat(32), opaque: 'x' },
          username: 'alice',
          password: PASSWORD,
          method: 'GET',
          uri,
        }),
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).not.toContain('stale');
    });

    it('binds the response to the request method and target', async () => {
      const c = await challenge();
      const header = digestAuthorization({
        challenge: c,
        username: 'alice',
        password: PASSWORD,
        method: 'GET',
        uri,
      });

      expect((await get(header, 'DELETE')).status).toBe(401);

      const c2 = await challenge();
      const forOther = digestAuthorization({
        challenge: c2,
        username: 'alice',
        password: PASSWORD,
        method: 'GET',
        uri: '/dav/acme/files/other.txt',
      });
      expect((await get(forOther)).status).toBe(401);
    });

    it('rejects an unknown user, a wrong realm, a foreign opaque and a malformed header', async () => {
      const c = await challenge();
      const good = {
        challenge: c,
        username: 'alice',
        password: PASSWORD,
        method: 'GET',
        uri,
      };

      expect(
        (await get(digestAuthorization({ ...good, username: 'ghost' }))).status,
      ).toBe(401);
      expect(
        (
          await get(
            digestAuthorization({
              ...good,
              challenge: { ...(await challenge()), realm: 'other' },
            }),
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await get(
            digestAuthorization({
              ...good,
              challenge: { ...(await challenge()), opaque: 'forged' },
            }),
          )
        ).status,
      ).toBe(401);
      expect((await get('Digest nonsense')).status).toBe(401);
      expect((await get('Digest')).status).toBe(401);
    });

    it('rejects qop other than auth and a non-SHA-256 algorithm', async () => {
      const c = await challenge();
      const header = digestAuthorization({
        challenge: c,
        username: 'alice',
        password: PASSWORD,
        method: 'GET',
        uri,
      });

      expect(
        (await get(header.replace('qop=auth', 'qop=auth-int'))).status,
      ).toBe(401);
      const c2 = await challenge();
      const md5 = digestAuthorization({
        challenge: c2,
        username: 'alice',
        password: PASSWORD,
        method: 'GET',
        uri,
      });
      expect(
        (await get(md5.replace('algorithm=SHA-256', 'algorithm=MD5'))).status,
      ).toBe(401);
    });
  });

  describe('chained with Basic', () => {
    beforeEach(() => start('chained'));

    it('sends one separate WWW-Authenticate header line per active scheme', async () => {
      const lines = await new Promise<string[]>((resolve, reject) => {
        http
          .get(`${baseUrl}${uri}`, (res) => {
            const found: string[] = [];
            for (let i = 0; i < res.rawHeaders.length; i += 2) {
              if (res.rawHeaders[i]!.toLowerCase() === 'www-authenticate') {
                found.push(res.rawHeaders[i + 1]!);
              }
            }
            res.resume();
            resolve(found);
          })
          .on('error', reject);
      });

      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('Basic realm="davnode"');
      expect(lines[1]).toMatch(/^Digest realm="davnode", qop="auth"/);
    });

    it('authenticates a Digest-only client', async () => {
      const first = await fetch(`${baseUrl}${uri}`);
      const digestLine = first.headers
        .get('www-authenticate')!
        .match(/Digest .*$/)![0];
      const c = parseChallenge(digestLine);

      const response = await get(
        digestAuthorization({
          challenge: c,
          username: 'alice',
          password: PASSWORD,
          method: 'GET',
          uri,
        }),
      );

      expect(response.status).toBe(200);
    });

    it('authenticates a Basic client', async () => {
      const response = await get(
        `Basic ${Buffer.from(`alice:${PASSWORD}`).toString('base64')}`,
      );

      expect(response.status).toBe(200);
    });

    it('rejects a wrong Basic password with both challenges', async () => {
      const response = await get(
        `Basic ${Buffer.from('alice:wrong').toString('base64')}`,
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toMatch(/Digest realm/);
    });
  });

  describe('parseDigestAuthorization', () => {
    it('parses quoted and bare values, escapes and mixed case', () => {
      expect(
        parseDigestAuthorization(
          'digest Username="a\\"b", realm="r, with comma", nc=00000001, qop=auth',
        ),
      ).toEqual({
        username: 'a"b',
        realm: 'r, with comma',
        nc: '00000001',
        qop: 'auth',
      });
    });

    it('returns null for other schemes, garbage and duplicate keys', () => {
      expect(parseDigestAuthorization('Basic abc')).toBeNull();
      expect(parseDigestAuthorization(undefined)).toBeNull();
      expect(parseDigestAuthorization('Digest ===')).toBeNull();
      expect(parseDigestAuthorization('Digest a=1, a=2')).toBeNull();
    });
  });
});
