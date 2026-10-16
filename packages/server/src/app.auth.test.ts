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
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { DEFAULT_AUTH_CONFIG, type AuthConfig } from './auth-config.js';
import {
  digestAuthorization,
  parseChallenge,
} from './http/digest-test.util.js';

const PASSWORD = 'correct horse battery staple';
const ISSUER = 'https://idp.example.com';

describe('createApp authentication schemes (M10)', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  let baseUrl: string;
  let privateKey: CryptoKey;
  let jwks: { keys: object[] };
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
      name: 'Acme Inc.',
    });
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }] };
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    await dataSource.destroy();
  });

  const config = (
    providers: AuthConfig['providers'],
    extra: Partial<AuthConfig> = {},
  ): AuthConfig => ({ ...DEFAULT_AUTH_CONFIG, providers, ...extra });

  async function start(auth?: AuthConfig): Promise<void> {
    // The OAuth2 provider fetches the JWKS with the global fetch; answer
    // for the issuer, pass everything else (our own test requests) on.
    globalThis.fetch = ((
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) =>
      String(input).startsWith(ISSUER)
        ? Promise.resolve(Response.json(jwks))
        : realFetch(input, init)) as typeof fetch;
    server = createApp(dataSource, auth ? { auth } : {}).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  /** Creates users that exist in every scheme: a tenant_admin whose password works for Basic and Digest. */
  async function createAdmin(digestRealm?: string) {
    return new UserService(dataSource, { digestRealm }).createUser({
      tenantId: tenant.id,
      username: 'boss',
      email: 'boss@example.com',
      password: PASSWORD,
      role: 'tenant_admin',
    });
  }

  const url = '/admin/acme/users';
  const basic = (user: string, password = PASSWORD) =>
    `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

  function challengeLines(
    path: string,
    authorization?: string,
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      http
        .get(
          `${baseUrl}${path}`,
          { headers: authorization ? { Authorization: authorization } : {} },
          (res) => {
            const lines: string[] = [];
            for (let i = 0; i < res.rawHeaders.length; i += 2) {
              if (res.rawHeaders[i]!.toLowerCase() === 'www-authenticate') {
                lines.push(res.rawHeaders[i + 1]!);
              }
            }
            res.resume();
            resolve(lines);
          },
        )
        .on('error', reject);
    });
  }

  it('with the default configuration offers exactly one Basic challenge, as in M2', async () => {
    await createAdmin();
    await start();

    expect(await challengeLines(url)).toEqual(['Basic realm="davnode"']);
    expect(
      (
        await fetch(`${baseUrl}${url}`, {
          headers: { Authorization: basic('boss') },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(`${baseUrl}${url}`, {
          headers: { Authorization: basic('boss', 'x') },
        })
      ).status,
    ).toBe(401);
  });

  it('with basic,digest an unauthenticated request gets both challenges as separate header lines', async () => {
    await createAdmin('davnode');
    await start(config(['basic', 'digest']));

    const lines = await challengeLines(url);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Basic realm="davnode"');
    expect(lines[1]).toMatch(
      /^Digest realm="davnode", qop="auth", algorithm=SHA-256/,
    );
  });

  it('a Digest-only client authenticates against the admin API when basic,digest are active', async () => {
    await createAdmin('davnode');
    await start(config(['basic', 'digest']));
    const lines = await challengeLines(url);
    const challenge = parseChallenge(lines[1]!);

    const response = await fetch(`${baseUrl}${url}`, {
      headers: {
        Authorization: digestAuthorization({
          challenge,
          username: 'boss',
          password: PASSWORD,
          method: 'GET',
          uri: url,
        }),
      },
    });

    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { users: unknown[] }).users,
    ).toHaveLength(1);
  });

  it('a Basic client still works when basic,digest are active, and a wrong Basic password is refused with both challenges', async () => {
    await createAdmin('davnode');
    await start(config(['basic', 'digest']));

    expect(
      (
        await fetch(`${baseUrl}${url}`, {
          headers: { Authorization: basic('boss') },
        })
      ).status,
    ).toBe(200);
    expect(await challengeLines(url, basic('boss', 'wrong'))).toHaveLength(2);
  });

  it('does not offer Digest when it is not enabled', async () => {
    await createAdmin();
    await start(config(['basic']));

    expect((await challengeLines(url)).join(' ')).not.toMatch(/Digest/);
  });

  it('with all three schemes offers three challenges and accepts a linked bearer token', async () => {
    const boss = await createAdmin('davnode');
    await dataSource.getRepository(Tenant).findOneByOrFail({ id: tenant.id });
    await start(
      config(['basic', 'digest', 'oauth2'], {
        oauth2Issuers: [
          { issuer: ISSUER, audience: 'davnode', jwksUri: `${ISSUER}/jwks` },
        ],
      }),
    );

    // Link the identity through the admin API itself (Basic-authenticated).
    const linked = await fetch(
      `${baseUrl}/admin/acme/users/${boss.id}/oauth2-link`,
      {
        method: 'POST',
        headers: {
          Authorization: basic('boss'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ issuer: ISSUER, subject: 'boss-sub' }),
      },
    );
    expect(linked.status).toBe(201);

    const lines = await challengeLines(url);
    expect(lines.map((line) => line.split(' ')[0])).toEqual([
      'Basic',
      'Digest',
      'Bearer',
    ]);

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience('davnode')
      .setSubject('boss-sub')
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(privateKey);
    const withToken = await fetch(`${baseUrl}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(withToken.status).toBe(200);

    // Removing the link locks the bearer token out; Basic keeps working.
    const unlinked = await fetch(
      `${baseUrl}/admin/acme/users/${boss.id}/oauth2-link`,
      {
        method: 'DELETE',
        headers: { Authorization: basic('boss') },
      },
    );
    expect(unlinked.status).toBe(204);
    const afterUnlink = await fetch(`${baseUrl}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(afterUnlink.status).toBe(401);
    expect(
      (
        await fetch(`${baseUrl}${url}`, {
          headers: { Authorization: basic('boss') },
        })
      ).status,
    ).toBe(200);
  });

  it('a bearer token of a user from another tenant does not authenticate on this tenant', async () => {
    const otherTenant = await new TenantService(dataSource).createTenant({
      slug: 'other',
      name: 'Other',
    });
    const outsider = await new UserService(dataSource).createUser({
      tenantId: otherTenant.id,
      username: 'outsider',
      email: 'o@example.com',
      password: PASSWORD,
      role: 'tenant_admin',
    });
    await new UserService(dataSource).linkOAuth2Identity(
      outsider.id,
      ISSUER,
      'outsider-sub',
    );
    await start(
      config(['basic', 'oauth2'], {
        oauth2Issuers: [
          { issuer: ISSUER, audience: 'davnode', jwksUri: `${ISSUER}/jwks` },
        ],
      }),
    );
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience('davnode')
      .setSubject('outsider-sub')
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(privateKey);

    const onOwnTenant = await fetch(`${baseUrl}/admin/other/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const onForeignTenant = await fetch(`${baseUrl}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(onOwnTenant.status).toBe(200);
    expect(onForeignTenant.status).toBe(401);
  });
});
