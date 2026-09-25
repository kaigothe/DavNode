import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  CalendarCollection,
  createDataSource,
  createOwnerAllAce,
  SchedulingInboxItem,
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

/** A delivered iTIP message, as it's stored in a `SchedulingInboxItem`. */
function requestIcs(uid: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    'DTSTART:20260924T100000Z',
    'SEQUENCE:0',
    'ORGANIZER:mailto:alice@example.com',
    'ATTENDEE:mailto:bob@example.com',
    'SUMMARY:Planning',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** A calendar object an organizer PUTs to their own calendar, with an ATTENDEE — no `METHOD`, unlike an iTIP message. */
function organizerEventIcs(uid: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    'DTSTART:20260924T100000Z',
    'SEQUENCE:0',
    'ORGANIZER:mailto:alice@example.com',
    'ATTENDEE:mailto:bob@example.com',
    'SUMMARY:Planning',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

describe('inbox route', () => {
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

  const home = (owner: User) => `/dav/acme/calendars/${owner.principalId}`;
  const inboxUrl = (owner: User) => `${home(owner)}/inbox`;

  function request(
    method: string,
    path: string,
    options: { username?: string; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
        ...options.headers,
      },
    });
  }

  function propfind(
    path: string,
    options: { depth?: string; username?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (options.depth !== undefined) {
      headers.Depth = options.depth;
    }
    return request('PROPFIND', path, { username: options.username, headers });
  }

  async function deliverInboxItem(
    owner: User,
    fields: Partial<SchedulingInboxItem> = {},
  ): Promise<SchedulingInboxItem> {
    const items = dataSource.getRepository(SchedulingInboxItem);
    return items.save(
      items.create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.principalId,
        icsData: requestIcs('uid-1'),
        method: 'REQUEST',
        uid: 'uid-1',
        etag: 'etag-1',
        ...fields,
      }),
    );
  }

  /** Each `<D:response>`'s own `<D:href>` (a direct child, before its `<D:propstat>`). */
  function responseHrefs(xml: string): string[] {
    return [...xml.matchAll(/<D:response>([\s\S]*?)<\/D:response>/g)].map(
      ([block]) => /<D:href>([^<]*)<\/D:href>/.exec(block)?.[1] ?? '',
    );
  }

  it("PROPFIND on the owner's own inbox lists all delivered items", async () => {
    const first = await deliverInboxItem(bob, { uid: 'uid-1', etag: 'etag-1' });
    const second = await deliverInboxItem(bob, {
      uid: 'uid-2',
      etag: 'etag-2',
      method: 'CANCEL',
    });

    const response = await propfind(inboxUrl(bob), {
      depth: '1',
      username: 'bob',
    });

    expect(response.status).toBe(207);
    expect(responseHrefs(await response.text())).toEqual([
      inboxUrl(bob),
      `${inboxUrl(bob)}/${first.id}`,
      `${inboxUrl(bob)}/${second.id}`,
    ]);
  });

  it('reports resourcetype with DAV:collection and CALDAV:schedule-inbox on the collection', async () => {
    const response = await propfind(inboxUrl(bob), {
      depth: '0',
      username: 'bob',
    });

    expect(response.status).toBe(207);
    const body = await response.text();
    expect(body).toContain('<D:collection');
    expect(body).toContain(
      '<C:schedule-inbox xmlns:C="urn:ietf:params:xml:ns:caldav"/>',
    );
  });

  it('Depth: 0 answers with the collection alone, no items', async () => {
    await deliverInboxItem(bob);

    const response = await propfind(inboxUrl(bob), {
      depth: '0',
      username: 'bob',
    });

    expect(response.status).toBe(207);
    expect(responseHrefs(await response.text())).toEqual([inboxUrl(bob)]);
  });

  it('rejects Depth: infinity and a missing Depth header with 403', async () => {
    expect(
      (await propfind(inboxUrl(bob), { depth: 'infinity', username: 'bob' }))
        .status,
    ).toBe(403);
    expect((await propfind(inboxUrl(bob), { username: 'bob' })).status).toBe(
      403,
    );
  });

  it('GET on an inbox item returns its ics_data as text/calendar with an ETag', async () => {
    const item = await deliverInboxItem(bob, {
      icsData: requestIcs('uid-42'),
      etag: 'the-etag',
    });

    const response = await request('GET', `${inboxUrl(bob)}/${item.id}`, {
      username: 'bob',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/calendar');
    expect(response.headers.get('etag')).toBe('the-etag');
    expect(await response.text()).toContain('UID:uid-42');
  });

  it('GET on a nonexistent inbox item returns 404', async () => {
    const response = await request(
      'GET',
      `${inboxUrl(bob)}/00000000-0000-0000-0000-000000000000`,
      { username: 'bob' },
    );

    expect(response.status).toBe(404);
  });

  it('DELETE on an inbox item removes it permanently', async () => {
    const item = await deliverInboxItem(bob);

    const deleteResponse = await request(
      'DELETE',
      `${inboxUrl(bob)}/${item.id}`,
      { username: 'bob' },
    );
    expect(deleteResponse.status).toBe(204);

    const getResponse = await request('GET', `${inboxUrl(bob)}/${item.id}`, {
      username: 'bob',
    });
    expect(getResponse.status).toBe(404);
    expect(
      await dataSource
        .getRepository(SchedulingInboxItem)
        .findOneBy({ id: item.id }),
    ).toBeNull();
  });

  it("returns 403 for another user's inbox: PROPFIND, GET and DELETE", async () => {
    const item = await deliverInboxItem(bob);

    expect((await propfind(inboxUrl(bob), { depth: '0' })).status).toBe(403);
    expect((await request('GET', `${inboxUrl(bob)}/${item.id}`)).status).toBe(
      403,
    );
    expect(
      (await request('DELETE', `${inboxUrl(bob)}/${item.id}`)).status,
    ).toBe(403);
  });

  it('returns 403 for a nonexistent userId, indistinguishable from a real other user', async () => {
    const response = await propfind(
      '/dav/acme/calendars/00000000-0000-0000-0000-000000000000/inbox',
      { depth: '0' },
    );

    expect(response.status).toBe(403);
  });

  it('a real organizer invite lands in the attendee inbox and is servable through this route', async () => {
    const calendar = await dataSource.transaction(async (manager) => {
      const created = await manager.getRepository(CalendarCollection).save(
        manager.getRepository(CalendarCollection).create({
          tenantId: tenant.id,
          ownerPrincipalId: alice.principalId,
          name: 'work',
          displayName: 'Work',
        }),
      );
      await createOwnerAllAce(
        manager,
        'calendar',
        created.id,
        alice.principalId,
      );
      return created;
    });

    const putResponse = await fetch(
      `${baseUrl}${home(alice)}/${calendar.name}/event.ics`,
      {
        method: 'PUT',
        headers: {
          Authorization: basicAuthHeader('alice', PASSWORD),
          'Content-Type': 'text/calendar; charset=utf-8',
        },
        body: organizerEventIcs('uid-99'),
      },
    );
    expect(putResponse.status).toBe(201);

    const listing = await propfind(inboxUrl(bob), {
      depth: '1',
      username: 'bob',
    });
    expect(listing.status).toBe(207);
    const itemHrefs = responseHrefs(await listing.text()).filter(
      (href) => href !== inboxUrl(bob),
    );
    expect(itemHrefs).toHaveLength(1);

    const itemResponse = await request('GET', itemHrefs[0]!, {
      username: 'bob',
    });
    expect(itemResponse.status).toBe(200);
    const itemBody = await itemResponse.text();
    expect(itemBody).toContain('METHOD:REQUEST');
    expect(itemBody).toContain('UID:uid-99');
  });
});
