// Seeds a running DavNode with demo data through its public HTTP interfaces
// (admin API + DAV), so it doubles as an end-to-end example. Idempotent:
// running it twice leaves the same data. Usage:
//
//   node scripts/demo/seed.mjs http://localhost:8080 demo admin 'password'
//
// The tenant and the admin user must exist (bootstrap CLI).
/* global fetch */
import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';
import { setTimeout } from 'node:timers';
const [base, tenant, adminUser, adminPassword] = process.argv.slice(2);
if (!base || !tenant || !adminUser || !adminPassword) {
  console.error(
    'usage: seed.mjs <base-url> <tenant> <admin-user> <admin-password>',
  );
  process.exit(2);
}
const USER_PASSWORD = process.env.DEMO_USER_PASSWORD ?? 'demo-password-1';

const auth = (user, password) =>
  'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');

async function call(
  method,
  path,
  {
    user = adminUser,
    password = adminPassword,
    body,
    headers = {},
    ok = [],
  } = {},
) {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: auth(user, password), ...headers },
    body,
  });
  if (!res.ok && !ok.includes(res.status)) {
    throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res;
}

const json = (value) => ({
  body: JSON.stringify(value),
  headers: { 'content-type': 'application/json' },
});

async function ensureUser(username, email) {
  const list = await (await call('GET', `/admin/${tenant}/users`)).json();
  let user = list.users.find((u) => u.username === username);
  if (!user) {
    const res = await call(
      'POST',
      `/admin/${tenant}/users`,
      json({ username, email, password: USER_PASSWORD }),
    );
    user = await res.json();
  }
  return user;
}

async function ensureGroup(name, memberPrincipalIds) {
  const list = await (await call('GET', `/admin/${tenant}/groups`)).json();
  let group = list.groups.find((g) => g.name === name);
  if (!group) {
    group = await (
      await call(
        'POST',
        `/admin/${tenant}/groups`,
        json({ name, description: 'Demo group' }),
      )
    ).json();
  }
  for (const principalId of memberPrincipalIds) {
    await call('POST', `/admin/${tenant}/groups/${group.id}/members`, {
      ...json({ principalId }),
      ok: [409], // already a member
    });
  }
  return group;
}

const ics = (uid, summary, start, end) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//demo//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

const vcf = (uid, name, email) =>
  [
    'BEGIN:VCARD',
    'VERSION:4.0',
    `UID:${uid}`,
    `FN:${name}`,
    `EMAIL:${email}`,
    'END:VCARD',
    '',
  ].join('\r\n');

// The server may still be creating the demo tenant when this starts.
for (let attempt = 0; ; attempt++) {
  const res = await fetch(`${base}/admin/${tenant}/users`, {
    headers: { authorization: auth(adminUser, adminPassword) },
  });
  if (res.ok) break;
  if (attempt >= 30) throw new Error(`admin API not ready: ${res.status}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const alice = await ensureUser('alice', 'alice@example.com');
const bob = await ensureUser('bob', 'bob@example.com');
await ensureGroup('Team', [alice.principalId, bob.principalId]);

const as = { user: 'alice', password: USER_PASSWORD };
const cal = `/dav/${tenant}/calendars/${alice.principalId}/work/`;
const book = `/dav/${tenant}/addressbooks/${alice.principalId}/contacts/`;

// 405 means the collection already exists.
await call('MKCALENDAR', cal, { ...as, ok: [405] });
await call('PUT', `${cal}kickoff.ics`, {
  ...as,
  body: ics(
    'demo-kickoff',
    'Project kickoff',
    '20270105T090000Z',
    '20270105T100000Z',
  ),
  headers: { 'content-type': 'text/calendar' },
});
await call('PUT', `${cal}review.ics`, {
  ...as,
  body: ics(
    'demo-review',
    'Design review',
    '20270112T140000Z',
    '20270112T150000Z',
  ),
  headers: { 'content-type': 'text/calendar' },
});

await call('MKCOL', book, {
  ...as,
  ok: [405],
  headers: { 'content-type': 'application/xml' },
  body: '<?xml version="1.0"?><D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:set><D:prop><D:resourcetype><D:collection/><C:addressbook/></D:resourcetype><D:displayname>Contacts</D:displayname></D:prop></D:set></D:mkcol>',
});
await call('PUT', `${book}bob.vcf`, {
  ...as,
  body: vcf('demo-bob', 'Bob Example', 'bob@example.com'),
  headers: { 'content-type': 'text/vcard' },
});

await call('PUT', `/dav/${tenant}/files/welcome.txt`, {
  body: 'Welcome to the DavNode demo.\n',
  headers: { 'content-type': 'text/plain' },
});

console.log(
  `Seeded tenant "${tenant}": users alice and bob (password ${USER_PASSWORD}), group Team, a calendar, an address book and a file.`,
);
