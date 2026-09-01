import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  GroupService,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create } from 'xmlbuilder2';
import { createApp } from '../../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('principals route', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
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
    await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });

    const app = createApp(dataSource);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  async function propfind(
    path: string,
    options: { depth?: string; body?: string; username?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
    };
    if (options.depth !== undefined) {
      headers.Depth = options.depth;
    }
    return fetch(`${baseUrl}${path}`, {
      method: 'PROPFIND',
      headers,
      body: options.body,
    });
  }

  /** Each `<D:response>`'s own `<D:href>` (a direct child, before its `<D:propstat>`). */
  function responseHrefs(xml: string): string[] {
    const root = create(xml).root();
    const hrefs: string[] = [];
    root.each((responseNode) => {
      if (responseNode.node.localName !== 'response') {
        return;
      }
      responseNode.each((child) => {
        if (child.node.localName === 'href') {
          hrefs.push(child.node.textContent ?? '');
        }
      });
    });
    return hrefs;
  }

  it('Depth: 1 on /principals/users/ lists every user principal of the tenant', async () => {
    const userService = new UserService(dataSource);
    const bob = await userService.createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });

    const response = await propfind('/dav/acme/principals/users', {
      depth: '1',
    });

    expect(response.status).toBe(207);
    const body = await response.text();
    const hrefs = responseHrefs(body);
    expect(hrefs).toContain('/dav/acme/principals/users');
    expect(hrefs).toContain(`/dav/acme/principals/users/${bob.principalId}`);
    expect(hrefs).toHaveLength(3); // the users collection itself + alice + bob
  });

  it('PROPFIND on a single principal reports resourcetype <D:principal/>', async () => {
    const userService = new UserService(dataSource);
    const alice = await userService.createUser({
      tenantId: tenant.id,
      username: 'existing-check',
      email: 'existing-check@example.com',
      password: PASSWORD,
    });

    const requestBody = `<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>`;
    const response = await propfind(
      `/dav/acme/principals/users/${alice.principalId}`,
      { depth: '0', body: requestBody },
    );

    expect(response.status).toBe(207);
    const body = await response.text();
    expect(body).toContain('<D:principal');
  });

  it('a principal from a different tenant is not reachable through this path', async () => {
    const otherTenant = await new TenantService(dataSource).createTenant({
      slug: 'other',
      name: 'Other Inc.',
    });
    const otherUser = await new UserService(dataSource).createUser({
      tenantId: otherTenant.id,
      username: 'stranger',
      email: 'stranger@example.com',
      password: PASSWORD,
    });

    const response = await propfind(
      `/dav/acme/principals/users/${otherUser.principalId}`,
      { depth: '0' },
    );

    expect(response.status).toBe(404);
  });

  it('lists every group principal under /principals/groups/', async () => {
    const groupService = new GroupService(dataSource);
    const group = await groupService.createGroup({
      tenantId: tenant.id,
      name: 'engineering',
    });

    const response = await propfind('/dav/acme/principals/groups', {
      depth: '1',
    });

    expect(response.status).toBe(207);
    const hrefs = responseHrefs(await response.text());
    expect(hrefs).toContain(
      `/dav/acme/principals/groups/${group.principalId}`,
    );
  });

  it('Depth: 1 on /principals/ lists the users and groups sub-collections', async () => {
    const response = await propfind('/dav/acme/principals', { depth: '1' });

    expect(response.status).toBe(207);
    const hrefs = responseHrefs(await response.text());
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/dav/acme/principals',
        '/dav/acme/principals/users',
        '/dav/acme/principals/groups',
      ]),
    );
  });

  it('returns 404 for an unknown top-level segment', async () => {
    const response = await propfind('/dav/acme/principals/not-a-real-kind', {
      depth: '0',
    });

    expect(response.status).toBe(404);
  });

  it('rejects Depth: infinity with 403', async () => {
    const response = await propfind('/dav/acme/principals/users', {
      depth: 'infinity',
    });

    expect(response.status).toBe(403);
  });
});
