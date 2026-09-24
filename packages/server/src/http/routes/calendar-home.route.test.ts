import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  CalendarCollection,
  CalendarProperty,
  createDataSource,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create } from 'xmlbuilder2';
import { createApp } from '../../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('calendar-home route', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
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
    alice = await createUser('alice');

    const app = createApp(dataSource);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  function createUser(username: string): Promise<User> {
    return new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username,
      email: `${username}@example.com`,
      password: PASSWORD,
    });
  }

  function createCalendar(
    owner: User,
    name: string,
    fields: Partial<CalendarCollection> = {},
  ): Promise<CalendarCollection> {
    const calendars = dataSource.getRepository(CalendarCollection);
    return calendars.save(
      calendars.create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.principalId,
        name,
        displayName: name,
        ...fields,
      }),
    );
  }

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

  /** Every element of `xml`, in document order, with its namespace, local name, text and attributes. */
  function elementsOf(xml: string): {
    namespace: string | null;
    name: string;
    text: string;
    attributes: Record<string, string>;
  }[] {
    const found: ReturnType<typeof elementsOf> = [];
    const visit = (node: ReturnType<typeof create>): void => {
      node.each((child) => {
        const dom = child.node as unknown as {
          nodeType: number;
          localName: string;
          namespaceURI: string | null;
          textContent: string | null;
          getAttribute(name: string): string | null;
        };
        if (dom.nodeType !== 1) {
          return;
        }
        found.push({
          namespace: dom.namespaceURI,
          name: dom.localName,
          text: dom.textContent ?? '',
          attributes: Object.fromEntries(
            ['name', 'content-type', 'version']
              .map((attribute) => [attribute, dom.getAttribute(attribute)])
              .filter(([, value]) => value !== null),
          ) as Record<string, string>,
        });
        visit(child as unknown as ReturnType<typeof create>);
      });
    };
    visit(create(xml));
    return found;
  }

  const CALDAV = 'urn:ietf:params:xml:ns:caldav';
  const home = () => `/dav/acme/calendars/${alice.principalId}`;

  it("lists all of the requesting user's calendars under their own home collection", async () => {
    await createCalendar(alice, 'work');
    await createCalendar(alice, 'private');

    const response = await propfind(home(), { depth: '1' });

    expect(response.status).toBe(207);
    expect(responseHrefs(await response.text())).toEqual([
      home(),
      `${home()}/private`,
      `${home()}/work`,
    ]);
  });

  it('answers Depth: 0 on the home collection with the home alone', async () => {
    await createCalendar(alice, 'work');

    const response = await propfind(home(), { depth: '0' });

    expect(response.status).toBe(207);
    expect(responseHrefs(await response.text())).toEqual([home()]);
  });

  it('tolerates a trailing slash on the home URL', async () => {
    const response = await propfind(`${home()}/`, { depth: '0' });

    expect(response.status).toBe(207);
  });

  it("does not list another user's calendars", async () => {
    const bob = await createUser('bob');
    await createCalendar(bob, 'bob-only');

    const response = await propfind(home(), { depth: '1' });

    expect(response.status).toBe(207);
    expect(responseHrefs(await response.text())).toEqual([home()]);
  });

  it("returns 403 for another user's home collection", async () => {
    const bob = await createUser('bob');

    const response = await propfind(`/dav/acme/calendars/${bob.principalId}`, {
      depth: '0',
    });

    expect(response.status).toBe(403);
  });

  it("returns 403 for another user's calendar, even though it exists", async () => {
    const bob = await createUser('bob');
    await createCalendar(bob, 'bob-only');

    const response = await propfind(
      `/dav/acme/calendars/${bob.principalId}/bob-only`,
      { depth: '0' },
    );

    expect(response.status).toBe(403);
  });

  it('returns 403 for a nonexistent userId, indistinguishable from a real other user', async () => {
    const response = await propfind(
      '/dav/acme/calendars/00000000-0000-0000-0000-000000000000',
      { depth: '0' },
    );

    expect(response.status).toBe(403);
  });

  it('rejects Depth: infinity and a missing Depth header with 403', async () => {
    expect((await propfind(home(), { depth: 'infinity' })).status).toBe(403);
    expect((await propfind(home())).status).toBe(403);
  });

  it('returns 404 for a calendar that does not exist', async () => {
    const response = await propfind(`${home()}/nope`, { depth: '0' });

    expect(response.status).toBe(404);
  });

  it('returns 404 for a path deeper than one calendar', async () => {
    await createCalendar(alice, 'work');

    const response = await propfind(`${home()}/work/event.ics`, {
      depth: '0',
    });

    expect(response.status).toBe(404);
  });

  it('resolves a calendar by its URL name, not its display name', async () => {
    await createCalendar(alice, '5f1c7e2a', { displayName: 'Soccer Team' });

    const byName = await propfind(`${home()}/5f1c7e2a`, { depth: '0' });
    const byDisplayName = await propfind(`${home()}/Soccer%20Team`, {
      depth: '0',
    });

    expect(byName.status).toBe(207);
    expect(byDisplayName.status).toBe(404);
  });

  it('round-trips a calendar name that needs URL-encoding through its Depth: 1 href', async () => {
    await createCalendar(alice, 'Soccer Team & Friends');

    const listing = await propfind(home(), { depth: '1' });
    const childHref = responseHrefs(await listing.text()).find(
      (href) => href !== home(),
    );
    expect(childHref).toBe(
      `${home()}/${encodeURIComponent('Soccer Team & Friends')}`,
    );

    const single = await propfind(childHref!, { depth: '0' });
    expect(single.status).toBe(207);
  });

  it('does not list a calendar’s objects on Depth: 1, only the calendar itself', async () => {
    await createCalendar(alice, 'work');

    const response = await propfind(`${home()}/work`, { depth: '1' });

    expect(response.status).toBe(207);
    expect(responseHrefs(await response.text())).toEqual([`${home()}/work`]);
  });

  it('reports resourcetype with both DAV:collection and CALDAV:calendar on a calendar', async () => {
    await createCalendar(alice, 'work');

    const response = await propfind(`${home()}/work`, {
      depth: '0',
      body: '<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>',
    });

    expect(response.status).toBe(207);
    const types = elementsOf(await response.text()).filter(
      (element) => element.name === 'collection' || element.name === 'calendar',
    );
    expect(types.map((t) => [t.namespace, t.name])).toEqual([
      ['DAV:', 'collection'],
      [CALDAV, 'calendar'],
    ]);
  });

  it('reports the home collection as a plain collection', async () => {
    const response = await propfind(home(), {
      depth: '0',
      body: '<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>',
    });

    const types = elementsOf(await response.text()).filter(
      (element) => element.name === 'collection' || element.name === 'calendar',
    );
    expect(types.map((t) => [t.namespace, t.name])).toEqual([
      ['DAV:', 'collection'],
    ]);
  });

  it('reports the CalDAV properties of a calendar, and 404 for the ones it has no value for', async () => {
    await createCalendar(alice, 'work', {
      displayName: 'Work',
      description: 'Team <events>',
    });

    const response = await propfind(`${home()}/work`, {
      depth: '0',
      body: `<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop>
        <D:displayname/><C:calendar-description/><C:calendar-timezone/>
        <C:supported-calendar-component-set/><C:supported-calendar-data/>
      </D:prop></D:propfind>`,
    });

    expect(response.status).toBe(207);
    const elements = elementsOf(await response.text());
    const named = (name: string) => elements.find((e) => e.name === name);
    expect(named('displayname')?.text).toBe('Work');
    expect(named('calendar-description')).toMatchObject({
      namespace: CALDAV,
      text: 'Team <events>',
    });
    expect(named('comp')).toMatchObject({
      namespace: CALDAV,
      attributes: { name: 'VEVENT' },
    });
    expect(named('calendar-data')).toMatchObject({
      namespace: CALDAV,
      attributes: { 'content-type': 'text/calendar', version: '2.0' },
    });
    // calendar-timezone was never set: its own 404 propstat, not a 200.
    const statuses = elements
      .filter((e) => e.name === 'status')
      .map((e) => e.text);
    expect(statuses).toEqual(['HTTP/1.1 200 OK', 'HTTP/1.1 404 Not Found']);
  });

  it('returns dead properties of a calendar next to its live ones', async () => {
    const calendar = await createCalendar(alice, 'work');
    const properties = dataSource.getRepository(CalendarProperty);
    await properties.save(
      properties.create({
        calendarId: calendar.id,
        namespace: 'http://apple.com/ns/ical/',
        name: 'calendar-color',
        value: '#FF0000FF',
      }),
    );

    const requested = await propfind(`${home()}/work`, {
      depth: '0',
      body: '<D:propfind xmlns:D="DAV:" xmlns:I="http://apple.com/ns/ical/"><D:prop><I:calendar-color/></D:prop></D:propfind>',
    });
    expect(await requested.text()).toContain('#FF0000FF');

    const everything = await propfind(`${home()}/work`, { depth: '0' });
    const body = await everything.text();
    expect(body).toContain('#FF0000FF');
    expect(body).toContain('resourcetype');
  });

  it('lists property names only for propname', async () => {
    await createCalendar(alice, 'work', { description: 'secret text' });

    const response = await propfind(`${home()}/work`, {
      depth: '0',
      body: '<D:propfind xmlns:D="DAV:"><D:propname/></D:propfind>',
    });

    const body = await response.text();
    expect(body).toContain('calendar-description');
    expect(body).not.toContain('secret text');
  });

  it('CALDAV:calendar-home-set on the user principal points at the correct URL', async () => {
    const response = await fetch(
      `${baseUrl}/dav/acme/principals/users/${alice.principalId}`,
      {
        method: 'PROPFIND',
        headers: {
          Authorization: basicAuthHeader('alice', PASSWORD),
          Depth: '0',
        },
        body: '<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><C:calendar-home-set/></D:prop></D:propfind>',
      },
    );

    expect(response.status).toBe(207);
    const body = await response.text();
    expect(body).toContain(`<D:href>${home()}</D:href>`);
  });

  it('serves the URL calendar-home-set names', async () => {
    await createCalendar(alice, 'work');
    const principalResponse = await fetch(
      `${baseUrl}/dav/acme/principals/users/${alice.principalId}`,
      {
        method: 'PROPFIND',
        headers: {
          Authorization: basicAuthHeader('alice', PASSWORD),
          Depth: '0',
        },
        body: '<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><C:calendar-home-set/></D:prop></D:propfind>',
      },
    );
    const href = /<D:href>(\/dav\/acme\/calendars\/[^<]+)<\/D:href>/.exec(
      await principalResponse.text(),
    )?.[1];

    const homeResponse = await propfind(href!, { depth: '1' });

    expect(homeResponse.status).toBe(207);
    expect(responseHrefs(await homeResponse.text())).toHaveLength(2);
  });
});
