import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  Credential,
  OAuth2AuthProvider,
  Tenant,
  TenantService,
  User,
  UserService,
  type DataSource,
} from '@davnode/core';
import express from 'express';
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuthTerminator } from './auth-chain.js';
import { createBasicAuthMiddleware } from './basic-auth.middleware.js';
import { createOAuth2BearerMiddleware } from './oauth2-bearer.middleware.js';

const ISSUER = 'https://idp.example.com';
const PASSWORD = 'correct horse battery staple';

describe('createOAuth2BearerMiddleware', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let privateKey: CryptoKey;
  let provider: OAuth2AuthProvider;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;

  async function token(
    claims: { sub?: string; aud?: string; exp?: number } = {},
  ): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience(claims.aud ?? 'davnode')
      .setSubject(claims.sub ?? 'alice-sub')
      .setExpirationTime(claims.exp ?? Math.floor(Date.now() / 1000) + 300)
      .sign(privateKey);
  }

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
    alice = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    await dataSource.getRepository(Credential).save({
      userId: alice.id,
      type: 'oauth2',
      oauth2Issuer: ISSUER,
      oauth2Subject: 'alice-sub',
    });
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    const jwks = {
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }],
    };
    provider = new OAuth2AuthProvider(
      dataSource,
      [{ issuer: ISSUER, audience: 'davnode', jwksUri: `${ISSUER}/jwks` }],
      {
        jwks: {
          fetchFn: (() => Promise.resolve(Response.json(jwks))) as typeof fetch,
        },
      },
    );
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  function start(chained: boolean): void {
    const app = express();
    app.use((req, _res, next) => {
      req.tenant = tenant;
      next();
    });
    if (chained) {
      app.use(createBasicAuthMiddleware(dataSource, { chained: true }));
      app.use(createOAuth2BearerMiddleware(provider, { chained: true }));
      app.use(createAuthTerminator());
    } else {
      app.use(createOAuth2BearerMiddleware(provider));
    }
    app.all('/dav/acme/*splat', (req, res) => {
      res.json({ principalId: req.principal?.id });
    });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const get = (authorization?: string) =>
    fetch(`${baseUrl}/dav/acme/files/a.txt`, {
      headers: authorization ? { Authorization: authorization } : {},
    });

  describe('standalone', () => {
    beforeEach(() => start(false));

    it('authenticates a valid bearer token', async () => {
      const response = await get(`Bearer ${await token()}`);

      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { principalId: string }).principalId,
      ).toBe(alice.principalId);
    });

    it('answers a missing Authorization header with 401 and no error parameter', async () => {
      const response = await get();

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        'Bearer realm="davnode"',
      );
    });

    it.each([
      [
        'an expired token',
        async () => token({ exp: Math.floor(Date.now() / 1000) - 3600 }),
      ],
      ['a wrong audience', async () => token({ aud: 'other' })],
      ['an unlinked subject', async () => token({ sub: 'stranger' })],
      ['garbage', async () => 'garbage'],
    ])('answers %s with error="invalid_token"', async (_name, make) => {
      const response = await get(`Bearer ${await make()}`);

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        'Bearer realm="davnode", error="invalid_token"',
      );
    });

    it('treats a bearer header without a token as invalid_token', async () => {
      const response = await get('Bearer ');

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain(
        'invalid_token',
      );
    });

    it('ignores a Basic Authorization header: plain challenge, no invalid_token', async () => {
      const response = await get(
        `Basic ${Buffer.from(`alice:${PASSWORD}`).toString('base64')}`,
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        'Bearer realm="davnode"',
      );
    });
  });

  describe('chained with Basic', () => {
    beforeEach(() => start(true));

    it('offers both schemes on separate header lines when unauthenticated', async () => {
      const lines = await new Promise<string[]>((resolve, reject) => {
        http
          .get(`${baseUrl}/dav/acme/files/a.txt`, (res) => {
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

      expect(lines).toEqual([
        'Basic realm="davnode"',
        'Bearer realm="davnode"',
      ]);
    });

    it('authenticates a bearer client and a Basic client', async () => {
      expect((await get(`Bearer ${await token()}`)).status).toBe(200);
      expect(
        (
          await get(
            `Basic ${Buffer.from(`alice:${PASSWORD}`).toString('base64')}`,
          )
        ).status,
      ).toBe(200);
    });

    it('a rejected token still gets the invalid_token challenge next to the Basic one', async () => {
      const response = await get(`Bearer ${await token({ sub: 'stranger' })}`);

      expect(response.status).toBe(401);
      const header = response.headers.get('www-authenticate')!;
      expect(header).toContain('Basic realm="davnode"');
      expect(header).toContain('error="invalid_token"');
    });
  });
});
