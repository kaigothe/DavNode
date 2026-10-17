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
import parsePrometheusTextFormat from 'parse-prometheus-text-format';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createMetrics } from './metrics.js';

const PASSWORD = 'correct horse battery staple';

/** A request with an arbitrary method, which fetch refuses to send. */
function rawRequest(baseUrl: string, method: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}/healthz`, { method }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    request.on('error', reject);
    request.end();
  });
}

type Family = ReturnType<typeof parsePrometheusTextFormat>[number];

describe('metrics endpoint', () => {
  let dataSource: DataSource;
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
    await tenants.createTenant({ slug: 'other', name: 'Other' });
    const users = new UserService(dataSource);
    for (const [username, role] of [
      ['root', 'server_admin'],
      ['boss', 'tenant_admin'],
      ['plain', 'member'],
    ] as const) {
      await users.createUser({
        tenantId: acme.id,
        username,
        email: `${username}@example.com`,
        password: PASSWORD,
        role,
      });
    }
    await dataSource
      .getRepository(Tenant)
      .update({ slug: 'acme' }, { quotaUsedBytes: 1234 });
    server = createApp(dataSource).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  const auth = (user: string, password = PASSWORD) =>
    `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

  const scrape = (user = 'root') =>
    fetch(`${baseUrl}/admin/acme/metrics`, {
      headers: { Authorization: auth(user) },
    });

  async function families(user = 'root'): Promise<Map<string, Family>> {
    const response = await scrape(user);
    expect(response.status).toBe(200);
    return new Map(
      parsePrometheusTextFormat(await response.text()).map((f) => [f.name, f]),
    );
  }

  const valueOf = (
    family: Family | undefined,
    labels: Record<string, string>,
  ) =>
    family?.metrics.find((m) =>
      Object.entries(labels).every(([k, v]) => m.labels?.[k] === v),
    )?.value;

  it('serves the Prometheus text format, parsable by a standard parser', async () => {
    const response = await scrape();

    expect(response.headers.get('content-type')).toMatch(
      /^text\/plain;.*version=0\.0\.4/,
    );
    const parsed = parsePrometheusTextFormat(await response.text());
    expect(parsed.map((f) => f.name).sort()).toEqual([
      'auth_failures_total',
      'http_request_duration_seconds',
      'http_requests_total',
      'quota_used_bytes',
    ]);
    expect(
      parsed.find((f) => f.name === 'http_request_duration_seconds')?.type,
    ).toBe('HISTOGRAM');
  });

  it('http_requests_total grows with the requests made', async () => {
    const before = valueOf((await families()).get('http_requests_total'), {
      method: 'PROPFIND',
      status: '207',
    });
    for (let i = 0; i < 3; i += 1) {
      await fetch(`${baseUrl}/dav/acme/principals/`, {
        method: 'PROPFIND',
        headers: { Authorization: auth('root'), Depth: '0' },
      });
    }

    const after = valueOf((await families()).get('http_requests_total'), {
      method: 'PROPFIND',
      status: '207',
    });

    expect(Number(after) - Number(before ?? 0)).toBe(3);
  });

  it('the request metrics have no tenant, user or path label, and unknown methods collapse to OTHER', async () => {
    await fetch(`${baseUrl}/dav/acme/principals/`, {
      method: 'PROPFIND',
      headers: { Authorization: auth('plain'), Depth: '0' },
    });
    await rawRequest(baseUrl, 'SEARCH');

    const all = await families();

    for (const name of [
      'http_requests_total',
      'http_request_duration_seconds',
    ]) {
      const labels = new Set(
        all.get(name)!.metrics.flatMap((m) => Object.keys(m.labels ?? {})),
      );
      for (const label of labels) {
        expect(['method', 'status', 'le']).toContain(label);
      }
    }
    expect(
      valueOf(all.get('http_requests_total'), { method: 'OTHER' }),
    ).toBeDefined();
  });

  it('counts failed logins per scheme, not successful ones or requests without credentials', async () => {
    const failures = async () =>
      Number(
        valueOf((await families()).get('auth_failures_total'), {
          scheme: 'basic',
        }),
      );
    const before = await failures();

    await fetch(`${baseUrl}/dav/acme/principals/`, {
      headers: { Authorization: auth('root', 'wrong') },
    });
    await fetch(`${baseUrl}/dav/acme/principals/`, {
      headers: { Authorization: auth('nobody', 'x') },
    });
    await fetch(`${baseUrl}/dav/acme/principals/`, {
      headers: { Authorization: auth('root') },
    });
    await fetch(`${baseUrl}/dav/acme/principals/`);

    expect(await failures()).toBe(before + 2);
    const all = await families();
    expect(valueOf(all.get('auth_failures_total'), { scheme: 'digest' })).toBe(
      '0',
    );
    expect(valueOf(all.get('auth_failures_total'), { scheme: 'oauth2' })).toBe(
      '0',
    );
  });

  it('reports the used quota per tenant, read fresh at each scrape', async () => {
    const first = (await families()).get('quota_used_bytes');
    expect(valueOf(first, { tenant_slug: 'acme' })).toBe('1234');
    expect(valueOf(first, { tenant_slug: 'other' })).toBe('0');

    await dataSource
      .getRepository(Tenant)
      .update({ slug: 'acme' }, { quotaUsedBytes: 99 });

    expect(
      valueOf((await families()).get('quota_used_bytes'), {
        tenant_slug: 'acme',
      }),
    ).toBe('99');
  });

  it('is forbidden for a tenant_admin and a member, and needs authentication', async () => {
    expect((await scrape('boss')).status).toBe(403);
    expect((await scrape('plain')).status).toBe(403);
    expect((await fetch(`${baseUrl}/admin/acme/metrics`)).status).toBe(401);
  });
});

describe('createMetrics', () => {
  it('keeps separate counts per instance', async () => {
    const dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    try {
      const a = createMetrics(dataSource);
      const b = createMetrics(dataSource);
      a.observeRequest('GET', 200, 0.01);

      expect(await a.render()).toContain(
        'http_requests_total{method="GET",status="200"} 1',
      );
      expect(await b.render()).not.toContain('method="GET"');
    } finally {
      await dataSource.destroy();
    }
  });
});
