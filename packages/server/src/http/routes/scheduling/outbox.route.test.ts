import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  TenantService,
  User,
  UserService,
  type DataSource,
  type Tenant,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('outbox route (PROPFIND)', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;
  let baseUrl: string;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;

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
    const userService = new UserService(dataSource);
    const createUser = (username: string): Promise<User> =>
      userService.createUser({
        tenantId: tenant.id,
        username,
        email: `${username}@example.com`,
        password: PASSWORD,
      });
    alice = await createUser('alice');
    bob = await createUser('bob');

    const app = createApp(dataSource);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  const outboxUrl = (owner: User) =>
    `/dav/acme/calendars/${owner.principalId}/outbox`;

  function propfind(
    path: string,
    options: { depth?: string; username?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
    };
    if (options.depth !== undefined) {
      headers.Depth = options.depth;
    }
    return fetch(`${baseUrl}${path}`, { method: 'PROPFIND', headers });
  }

  /** Each `<D:response>`'s own `<D:href>` (a direct child, before its `<D:propstat>`). */
  function responseHrefs(xml: string): string[] {
    return [...xml.matchAll(/<D:response>([\s\S]*?)<\/D:response>/g)].map(
      ([block]) => /<D:href>([^<]*)<\/D:href>/.exec(block)?.[1] ?? '',
    );
  }

  it('PROPFIND on the own outbox returns an empty collection', async () => {
    const response = await propfind(outboxUrl(alice), { depth: '1' });

    expect(response.status).toBe(207);
    expect(responseHrefs(await response.text())).toEqual([outboxUrl(alice)]);
  });

  it('reports resourcetype with DAV:collection and CALDAV:schedule-outbox', async () => {
    const response = await propfind(outboxUrl(alice), { depth: '0' });

    expect(response.status).toBe(207);
    const body = await response.text();
    expect(body).toContain('<D:collection');
    expect(body).toContain(
      '<C:schedule-outbox xmlns:C="urn:ietf:params:xml:ns:caldav"/>',
    );
  });

  it('Depth: 0 and Depth: 1 answer identically, since there are never any children', async () => {
    const depth0 = await propfind(outboxUrl(alice), { depth: '0' });
    const depth1 = await propfind(outboxUrl(alice), { depth: '1' });

    expect(responseHrefs(await depth0.text())).toEqual(
      responseHrefs(await depth1.text()),
    );
  });

  it('rejects Depth: infinity and a missing Depth header with 403', async () => {
    expect(
      (await propfind(outboxUrl(alice), { depth: 'infinity' })).status,
    ).toBe(403);
    expect((await propfind(outboxUrl(alice))).status).toBe(403);
  });

  it("returns 403 for another user's outbox", async () => {
    const response = await propfind(outboxUrl(bob), { depth: '0' });

    expect(response.status).toBe(403);
  });

  it('returns 403 for a nonexistent userId, indistinguishable from a real other user', async () => {
    const response = await propfind(
      '/dav/acme/calendars/00000000-0000-0000-0000-000000000000/outbox',
      { depth: '0' },
    );

    expect(response.status).toBe(403);
  });

  it('returns 404 for a path deeper than the outbox collection itself', async () => {
    const response = await propfind(`${outboxUrl(alice)}/something`, {
      depth: '0',
    });

    expect(response.status).toBe(404);
  });
});
