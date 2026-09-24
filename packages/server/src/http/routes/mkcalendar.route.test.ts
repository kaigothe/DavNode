import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  CalendarAce,
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
const CALDAV = 'urn:ietf:params:xml:ns:caldav';

/** The `calendar-timezone` value of RFC 4791 §5.2.2's example. */
const US_EASTERN = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Example Corp.//CalDAV Client//EN',
  'VERSION:2.0',
  'BEGIN:VTIMEZONE',
  'TZID:US-Eastern',
  'LAST-MODIFIED:19870101T000000Z',
  'BEGIN:STANDARD',
  'DTSTART:19671029T020000',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:Eastern Standard Time (US & Canada)',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19870405T020000',
  'RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=4',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:Eastern Daylight Time (US & Canada)',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
  'END:VCALENDAR',
  '',
].join('\n');

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/** A `MKCALENDAR` body setting `props` (the inside of `<D:prop>`). */
function mkcalendarBody(props: string): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<C:mkcalendar xmlns:D="DAV:" xmlns:C="${CALDAV}" xmlns:I="http://apple.com/ns/ical/">
  <D:set><D:prop>${props}</D:prop></D:set>
</C:mkcalendar>`;
}

interface Element {
  namespace: string | null;
  name: string;
  text: string;
  attributes: Record<string, string>;
}

/** Every element of `xml`, in document order. */
function elementsOf(xml: string): Element[] {
  const found: Element[] = [];
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

describe('mkcalendar route', () => {
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

  const home = (user: User = alice) =>
    `/dav/acme/calendars/${user.principalId}`;

  function mkcalendar(
    path: string,
    options: {
      body?: string;
      username?: string;
      contentType?: string;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
    };
    if (options.contentType) {
      headers['Content-Type'] = options.contentType;
    }
    return fetch(`${baseUrl}${path}`, {
      method: 'MKCALENDAR',
      headers,
      body: options.body,
    });
  }

  async function propfind(
    path: string,
    depth: string,
    body?: string,
    username = 'alice',
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'PROPFIND',
      headers: {
        Authorization: basicAuthHeader(username, PASSWORD),
        Depth: depth,
      },
      body,
    });
  }

  const PROPS_REQUEST = `<D:propfind xmlns:D="DAV:" xmlns:C="${CALDAV}" xmlns:I="http://apple.com/ns/ical/"><D:prop>
    <D:displayname/><D:resourcetype/><C:calendar-description/><C:calendar-timezone/>
    <C:supported-calendar-component-set/><I:calendar-color/>
  </D:prop></D:propfind>`;

  async function propertiesOf(path: string): Promise<Element[]> {
    const response = await propfind(path, '0', PROPS_REQUEST);
    expect(response.status).toBe(207);
    return elementsOf(await response.text());
  }

  const calendarCount = () =>
    dataSource.getRepository(CalendarCollection).count();

  describe('creating a calendar', () => {
    it('creates a calendar from a bare MKCALENDAR, named and titled after its URL segment', async () => {
      const response = await mkcalendar(`${home()}/work`);

      expect(response.status).toBe(201);
      const elements = await propertiesOf(`${home()}/work`);
      expect(elements.find((e) => e.name === 'displayname')?.text).toBe('work');
      expect(
        elements.filter((e) => e.name === 'comp').map((e) => e.attributes.name),
      ).toEqual(['VEVENT']);
    });

    it('answers 201 with Cache-Control: no-cache and a CALDAV:mkcalendar-response body', async () => {
      const response = await mkcalendar(`${home()}/work`);

      expect(response.status).toBe(201);
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(response.headers.get('content-type')).toContain('application/xml');
      const [root] = elementsOf(await response.text());
      expect(root).toMatchObject({
        namespace: CALDAV,
        name: 'mkcalendar-response',
      });
    });

    it('makes the new calendar visible in the home collection listing', async () => {
      await mkcalendar(`${home()}/work`);
      await mkcalendar(`${home()}/private`);

      const listing = await propfind(home(), '1');

      const hrefs = elementsOf(await listing.text())
        .filter((e) => e.name === 'href')
        .map((e) => e.text);
      expect(hrefs).toEqual([home(), `${home()}/private`, `${home()}/work`]);
    });

    it("creates a calendar from RFC 4791's example request and serves its properties back", async () => {
      const response = await mkcalendar(`${home()}/events`, {
        contentType: 'application/xml; charset="utf-8"',
        body: mkcalendarBody(`
          <D:displayname>Lisa's Events</D:displayname>
          <C:calendar-description xml:lang="en">Calendar restricted to events.</C:calendar-description>
          <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>
          <C:calendar-timezone><![CDATA[${US_EASTERN}]]></C:calendar-timezone>`),
      });

      expect(response.status).toBe(201);
      const elements = await propertiesOf(`${home()}/events`);
      const text = (name: string) =>
        elements.find((e) => e.name === name)?.text;
      expect(text('displayname')).toBe("Lisa's Events");
      expect(text('calendar-description')).toBe(
        'Calendar restricted to events.',
      );
      expect(text('calendar-timezone')).toBe(US_EASTERN);
    });

    it('reports resourcetype as DAV:collection plus CALDAV:calendar', async () => {
      await mkcalendar(`${home()}/work`);

      const elements = await propertiesOf(`${home()}/work`);

      const resourcetype = elements.findIndex((e) => e.name === 'resourcetype');
      expect(
        elements
          .slice(resourcetype + 1, resourcetype + 3)
          .map((e) => [e.namespace, e.name]),
      ).toEqual([
        ['DAV:', 'collection'],
        [CALDAV, 'calendar'],
      ]);
    });

    it('accepts a resourcetype in the body that names the calendar', async () => {
      const response = await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody(
          '<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>',
        ),
      });

      expect(response.status).toBe(201);
    });

    it('gives the owner the default ACE on the new calendar', async () => {
      await mkcalendar(`${home()}/work`);

      const calendar = await dataSource
        .getRepository(CalendarCollection)
        .findOneByOrFail({ name: 'work' });
      const aces = await dataSource
        .getRepository(CalendarAce)
        .findBy({ calendarId: calendar.id });
      expect(aces).toEqual([
        expect.objectContaining({
          principalId: alice.principalId,
          privilege: 'all',
          grantDeny: 'grant',
          protected: true,
        }),
      ]);
      expect(calendar.ownerPrincipalId).toBe(alice.principalId);
      expect(calendar.tenantId).toBe(tenant.id);
    });

    it('keeps a client-chosen opaque URL name apart from the display name', async () => {
      await mkcalendar(`${home()}/5f1c7e2a-9b1d`, {
        body: mkcalendarBody('<D:displayname>Soccer Team</D:displayname>'),
      });

      const elements = await propertiesOf(`${home()}/5f1c7e2a-9b1d`);
      expect(elements.find((e) => e.name === 'displayname')?.text).toBe(
        'Soccer Team',
      );
      expect((await propfind(`${home()}/Soccer%20Team`, '0')).status).toBe(404);
    });

    it('creates a calendar whose name needs URL-encoding and finds it again', async () => {
      const name = 'Soccer Team & Friends';

      const response = await mkcalendar(
        `${home()}/${encodeURIComponent(name)}`,
      );

      expect(response.status).toBe(201);
      const calendar = await dataSource
        .getRepository(CalendarCollection)
        .findOneByOrFail({ tenantId: tenant.id });
      expect(calendar.name).toBe(name);
      expect(
        (await propfind(`${home()}/${encodeURIComponent(name)}`, '0')).status,
      ).toBe(207);
    });

    it('lets two users each have a calendar of the same name', async () => {
      const bob = await createUser('bob');

      expect((await mkcalendar(`${home()}/work`)).status).toBe(201);
      expect(
        (await mkcalendar(`${home(bob)}/work`, { username: 'bob' })).status,
      ).toBe(201);

      expect(await calendarCount()).toBe(2);
    });
  });

  describe('properties', () => {
    it('reduces an unsupported component type to VEVENT instead of failing', async () => {
      const response = await mkcalendar(`${home()}/tasks`, {
        body: mkcalendarBody(
          '<C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>',
        ),
      });

      expect(response.status).toBe(201);
      const elements = await propertiesOf(`${home()}/tasks`);
      expect(
        elements.filter((e) => e.name === 'comp').map((e) => e.attributes.name),
      ).toEqual(['VEVENT']);
    });

    it('keeps VEVENT when VTODO is requested next to it', async () => {
      await mkcalendar(`${home()}/mixed`, {
        body: mkcalendarBody(
          '<C:supported-calendar-component-set><C:comp name="VEVENT"/><C:comp name="VTODO"/></C:supported-calendar-component-set>',
        ),
      });

      const calendar = await dataSource
        .getRepository(CalendarCollection)
        .findOneByOrFail({ name: 'mixed' });
      expect(calendar.supportedComponentSet).toEqual(['VEVENT']);
    });

    it('states the effective component set in the mkcalendar-response', async () => {
      const response = await mkcalendar(`${home()}/tasks`, {
        body: mkcalendarBody(
          '<C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>',
        ),
      });

      const comps = elementsOf(await response.text()).filter(
        (e) => e.name === 'comp',
      );
      expect(comps.map((e) => e.attributes.name)).toEqual(['VEVENT']);
    });

    it('stores client-defined properties and serves them back', async () => {
      const response = await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody(`
          <D:displayname>Work</D:displayname>
          <I:calendar-color>#FF0000FF</I:calendar-color>`),
      });

      expect(response.status).toBe(201);
      const elements = await propertiesOf(`${home()}/work`);
      expect(elements.find((e) => e.name === 'calendar-color')?.text).toBe(
        '#FF0000FF',
      );
      const calendar = await dataSource
        .getRepository(CalendarCollection)
        .findOneByOrFail({ name: 'work' });
      expect(
        await dataSource
          .getRepository(CalendarProperty)
          .countBy({ calendarId: calendar.id }),
      ).toBe(1);
    });

    it('lists what took effect in the mkcalendar-response', async () => {
      const response = await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody(`
          <D:displayname>Work</D:displayname>
          <I:calendar-color>#FF0000FF</I:calendar-color>`),
      });

      const names = elementsOf(await response.text()).map((e) => e.name);
      expect(names).toEqual([
        'mkcalendar-response',
        'propstat',
        'prop',
        'displayname',
        'calendar-color',
        'status',
      ]);
    });

    it('round-trips markup characters in the display name and description', async () => {
      await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody(`
          <D:displayname>Q&amp;A &lt;team&gt;</D:displayname>
          <C:calendar-description>a &amp; b &lt; c</C:calendar-description>`),
      });

      const elements = await propertiesOf(`${home()}/work`);
      expect(elements.find((e) => e.name === 'displayname')?.text).toBe(
        'Q&A <team>',
      );
      expect(
        elements.find((e) => e.name === 'calendar-description')?.text,
      ).toBe('a & b < c');
    });

    it('answers 207 for a property that cannot be set, fails the others with 424, and creates nothing', async () => {
      const response = await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody(`
          <D:displayname>Work</D:displayname>
          <D:creationdate>2001-01-01T00:00:00Z</D:creationdate>
          <I:calendar-color>#FF0000FF</I:calendar-color>`),
      });

      expect(response.status).toBe(207);
      const elements = elementsOf(await response.text());
      expect(elements[0]).toMatchObject({
        namespace: 'DAV:',
        name: 'multistatus',
      });
      const statuses = elements
        .filter((e) => e.name === 'status')
        .map((e) => e.text);
      expect(statuses).toEqual([
        'HTTP/1.1 424 Failed Dependency',
        'HTTP/1.1 403 Forbidden',
      ]);
      expect(await calendarCount()).toBe(0);
    });

    it('refuses a resourcetype that is not a calendar with 207/409 and creates nothing', async () => {
      const response = await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody(
          '<D:resourcetype><D:collection/></D:resourcetype>',
        ),
      });

      expect(response.status).toBe(207);
      expect(await response.text()).toContain('409 Conflict');
      expect(await calendarCount()).toBe(0);
    });
  });

  describe('calendar-timezone', () => {
    it('refuses one that is not a single VTIMEZONE with valid-calendar-data, creating nothing', async () => {
      const response = await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody(`
          <D:displayname>Work</D:displayname>
          <C:calendar-timezone>Europe/Berlin</C:calendar-timezone>`),
      });

      expect(response.status).toBe(403);
      const elements = elementsOf(await response.text());
      expect(elements.map((e) => [e.namespace, e.name])).toEqual([
        ['DAV:', 'error'],
        [CALDAV, 'valid-calendar-data'],
      ]);
      expect(await calendarCount()).toBe(0);
      expect((await propfind(`${home()}/work`, '0')).status).toBe(404);
    });

    it('refuses an empty one', async () => {
      const response = await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody('<C:calendar-timezone/>'),
      });

      expect(response.status).toBe(403);
      expect(await calendarCount()).toBe(0);
    });
  });

  describe('where a calendar can be created', () => {
    it("refuses another user's home with 403, whether or not that user exists", async () => {
      const bob = await createUser('bob');

      expect((await mkcalendar(`${home(bob)}/work`)).status).toBe(403);
      expect(
        (
          await mkcalendar(
            '/dav/acme/calendars/00000000-0000-0000-0000-000000000000/work',
          )
        ).status,
      ).toBe(403);
      expect(await calendarCount()).toBe(0);
    });

    it('refuses an existing calendar name with 405 and leaves the calendar as it was', async () => {
      await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody('<D:displayname>Original</D:displayname>'),
      });

      const again = await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody('<D:displayname>Replacement</D:displayname>'),
      });

      expect(again.status).toBe(405);
      expect(await calendarCount()).toBe(1);
      const elements = await propertiesOf(`${home()}/work`);
      expect(elements.find((e) => e.name === 'displayname')?.text).toBe(
        'Original',
      );
    });

    it('refuses the home collection itself with 405', async () => {
      expect((await mkcalendar(home())).status).toBe(405);
      expect((await mkcalendar(`${home()}/`)).status).toBe(405);
    });

    it('refuses a path below something that does not exist with 409', async () => {
      const response = await mkcalendar(`${home()}/missing/work`);

      expect(response.status).toBe(409);
      expect(await calendarCount()).toBe(0);
    });

    it('refuses a calendar inside a calendar with calendar-collection-location-ok', async () => {
      await mkcalendar(`${home()}/work`);

      const response = await mkcalendar(`${home()}/work/nested`);

      expect(response.status).toBe(403);
      expect(elementsOf(await response.text()).map((e) => e.name)).toEqual([
        'error',
        'calendar-collection-location-ok',
      ]);
      expect(await calendarCount()).toBe(1);
    });

    it.each([
      ['a name reserved for the scheduling inbox', 'inbox'],
      ['a name reserved for the scheduling outbox', 'Outbox'],
      ['a name with a control character', 'a%00b'],
      ['a name longer than the database holds', 'x'.repeat(256)],
    ])(
      'refuses %s with calendar-collection-location-ok',
      async (_label, name) => {
        const response = await mkcalendar(`${home()}/${name}`);

        expect(response.status).toBe(403);
        expect(elementsOf(await response.text()).map((e) => e.name)).toEqual([
          'error',
          'calendar-collection-location-ok',
        ]);
        expect(await calendarCount()).toBe(0);
      },
    );

    it('refuses a request without credentials with 401', async () => {
      const response = await fetch(`${baseUrl}${home()}/work`, {
        method: 'MKCALENDAR',
      });

      expect(response.status).toBe(401);
    });

    it('lets only one of two concurrent requests for the same name create it', async () => {
      const statuses = (
        await Promise.all([
          mkcalendar(`${home()}/work`),
          mkcalendar(`${home()}/work`),
          mkcalendar(`${home()}/work`),
        ])
      )
        .map((response) => response.status)
        .sort();

      expect(statuses).toEqual([201, 405, 405]);
      expect(await calendarCount()).toBe(1);
      expect(await dataSource.getRepository(CalendarAce).count()).toBe(1);
    });
  });

  describe('the request body', () => {
    it.each([
      ['not well-formed XML', '<C:mkcalendar', 400],
      ['plain text', 'make me a calendar', 400],
      [
        'a DAV:remove',
        `<C:mkcalendar xmlns:C="${CALDAV}" xmlns:D="DAV:"><D:remove><D:prop><D:displayname/></D:prop></D:remove></C:mkcalendar>`,
        400,
      ],
      [
        'an Extended MKCOL body',
        '<D:mkcol xmlns:D="DAV:"><D:set><D:prop><D:displayname>x</D:displayname></D:prop></D:set></D:mkcol>',
        415,
      ],
      ['a REPORT body', `<C:calendar-query xmlns:C="${CALDAV}"/>`, 415],
    ])(
      'refuses %s with %i and creates nothing',
      async (_label, body, status) => {
        const response = await mkcalendar(`${home()}/work`, { body });

        expect(response.status).toBe(status);
        expect(await calendarCount()).toBe(0);
      },
    );

    it('refuses a body over the size cap with 413 and creates nothing', async () => {
      const response = await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody(
          `<C:calendar-description>${'x'.repeat(60 * 1024)}</C:calendar-description>`,
        ),
      });

      expect(response.status).toBe(413);
      expect(await calendarCount()).toBe(0);
    });

    it('accepts a body just under the size cap', async () => {
      const response = await mkcalendar(`${home()}/work`, {
        body: mkcalendarBody(
          `<C:calendar-description>${'x'.repeat(40 * 1024)}</C:calendar-description>`,
        ),
      });

      expect(response.status).toBe(201);
    });

    it('treats a whitespace-only body like no body', async () => {
      const response = await mkcalendar(`${home()}/work`, { body: '  \n ' });

      expect(response.status).toBe(201);
    });
  });
});
