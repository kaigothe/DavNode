// Seeds a running DavNode with demo data through its public HTTP interfaces
// (admin API + DAV), so it doubles as an end-to-end example. Idempotent:
// running it twice leaves the same data. Usage:
//
//   node scripts/demo/seed.mjs http://localhost:8080 demo admin 'password'
//
// The tenant and the admin user must exist (bootstrap CLI). Calendar events
// are placed in the current month; DEMO_TODAY=2026-10-14 pins "today" so the
// documentation screenshots are reproducible.
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

async function ensureUser(username, email, role) {
  const list = await (await call('GET', `/admin/${tenant}/users`)).json();
  let user = list.users.find((u) => u.username === username);
  if (!user) {
    const res = await call(
      'POST',
      `/admin/${tenant}/users`,
      json({
        username,
        email,
        password: USER_PASSWORD,
        ...(role ? { role } : {}),
      }),
    );
    user = await res.json();
  }
  return user;
}

async function ensureGroup(
  name,
  memberPrincipalIds,
  description = 'Demo group',
) {
  const list = await (await call('GET', `/admin/${tenant}/groups`)).json();
  let group = list.groups.find((g) => g.name === name);
  if (!group) {
    group = await (
      await call('POST', `/admin/${tenant}/groups`, json({ name, description }))
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

// The server may still be creating the demo tenant when this starts.
for (let attempt = 0; ; attempt++) {
  const res = await fetch(`${base}/admin/${tenant}/users`, {
    headers: { authorization: auth(adminUser, adminPassword) },
  });
  if (res.ok) break;
  if (attempt >= 30) throw new Error(`admin API not ready: ${res.status}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const today = process.env.DEMO_TODAY
  ? new Date(`${process.env.DEMO_TODAY}T12:00:00Z`)
  : new Date();
const month = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
const day = (d) => `${month}${String(d).padStart(2, '0')}`;

const GB = 1024 ** 3;
const patch = (path, value) => call('PATCH', path, json(value));

// People: one tenant administrator and several members, with storage limits.
const maria = await ensureUser('maria', 'maria@example.com', 'tenant_admin');
const alice = await ensureUser('alice', 'alice@example.com');
const bob = await ensureUser('bob', 'bob@example.com');
const carol = await ensureUser('carol', 'carol@example.com');
const dave = await ensureUser('dave', 'dave@example.com');
await patch(`/admin/${tenant}/users/${alice.id}`, { quotaLimitBytes: 5 * GB });
await patch(`/admin/${tenant}/users/${bob.id}`, { quotaLimitBytes: 1 * GB });
await patch(`/admin/${tenant}/users/${carol.id}`, { quotaLimitBytes: 5 * GB });
await patch(`/admin/${tenant}/quota`, { quotaLimitBytes: 50 * GB });

// Groups, one of them a member of another.
const team = await ensureGroup(
  'Team',
  [alice.principalId, bob.principalId, carol.principalId],
  'The product team',
);
const sales = await ensureGroup(
  'Sales',
  [carol.principalId, dave.principalId],
  'Sales and support',
);
await ensureGroup(
  'Company',
  [team.principalId, sales.principalId, maria.principalId],
  'Everyone',
);

const as = { user: 'alice', password: USER_PASSWORD };
const home = `/dav/${tenant}/calendars/${alice.principalId}`;
const ICS = { 'content-type': 'text/calendar' };
const event = (uid, summary, lines) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//demo//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    ...lines,
    `SUMMARY:${summary}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
const put = (path, body, headers, extra = {}) =>
  call('PUT', path, { ...as, body, headers, ...extra });

// 405 means the collection already exists.
await call('MKCALENDAR', `${home}/work/`, { ...as, ok: [405] });
await put(
  `${home}/work/standup.ics`,
  event('demo-standup', 'Team standup', [
    `DTSTART:${day(1)}T080000Z`,
    `DTEND:${day(1)}T081500Z`,
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=40',
    'LOCATION:Room 1',
  ]),
  ICS,
);
await put(
  `${home}/work/kickoff.ics`,
  event('demo-kickoff', 'Project kickoff', [
    `DTSTART:${day(6)}T090000Z`,
    `DTEND:${day(6)}T100000Z`,
    'LOCATION:Main hall',
    'DESCRIPTION:Goals\\, scope and the first milestones.',
  ]),
  ICS,
);
await put(
  `${home}/work/review.ics`,
  event('demo-review', 'Design review', [
    `DTSTART:${day(12)}T140000Z`,
    `DTEND:${day(12)}T153000Z`,
    'LOCATION:Online',
    'DESCRIPTION:Walk through the new admin interface.',
  ]),
  ICS,
);
await put(
  `${home}/work/offsite.ics`,
  event('demo-offsite', 'Team offsite', [
    `DTSTART;VALUE=DATE:${day(20)}`,
    `DTEND;VALUE=DATE:${day(23)}`,
  ]),
  ICS,
);
await put(
  `${home}/work/release.ics`,
  event('demo-release', 'Release', [
    `DTSTART:${day(27)}T120000Z`,
    `DTEND:${day(27)}T130000Z`,
    'STATUS:CONFIRMED',
  ]),
  ICS,
);
await call('MKCALENDAR', `${home}/personal/`, { ...as, ok: [405] });
await put(
  `${home}/personal/dentist.ics`,
  event('demo-dentist', 'Dentist', [
    `DTSTART:${day(9)}T133000Z`,
    `DTEND:${day(9)}T141500Z`,
  ]),
  ICS,
);

const book = `/dav/${tenant}/addressbooks/${alice.principalId}/contacts/`;
await call('MKCOL', book, {
  ...as,
  ok: [405],
  headers: { 'content-type': 'application/xml' },
  body: '<?xml version="1.0"?><D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:set><D:prop><D:resourcetype><D:collection/><C:addressbook/></D:resourcetype><D:displayname>Contacts</D:displayname></D:prop></D:set></D:mkcol>',
});
const contacts = [
  [
    'bob',
    'Bob Example',
    'bob@example.com',
    'Example Ltd',
    '+49 30 5550101',
    'Colleague from the product team.',
  ],
  [
    'lena',
    'Lena Hoffmann',
    'lena.hoffmann@example.org',
    'Hoffmann Design',
    '+49 89 5550102',
    '',
  ],
  [
    'jonas',
    'Jonas Weber',
    'jonas.weber@example.org',
    'Weber & Söhne',
    '+49 40 5550103',
    'Prefers e-mail.',
  ],
  [
    'mira',
    'Mira Kowalski',
    'mira@example.net',
    'Northwind',
    '+48 22 5550104',
    '',
  ],
  [
    'tom',
    'Tom Becker',
    'tom.becker@example.net',
    'Becker Logistik',
    '+49 221 5550105',
    'Delivery contact.',
  ],
  [
    'sofia',
    'Sofia Rossi',
    'sofia.rossi@example.com',
    'Rossi Studio',
    '+39 06 5550106',
    '',
  ],
];
for (const [id, name, email, org, phone, note] of contacts) {
  await put(
    `${book}${id}.vcf`,
    [
      'BEGIN:VCARD',
      'VERSION:4.0',
      `UID:demo-${id}`,
      `FN:${name}`,
      `EMAIL;TYPE=work:${email}`,
      `TEL;TYPE=cell:${phone}`,
      `ORG:${org}`,
      ...(note ? [`NOTE:${note}`] : []),
      'END:VCARD',
      '',
    ].join('\r\n'),
    { 'content-type': 'text/vcard' },
  );
}

await call('PUT', `/dav/${tenant}/files/welcome.txt`, {
  body: 'Welcome to the DavNode demo.\n',
  headers: { 'content-type': 'text/plain' },
});

console.log(
  `Seeded tenant "${tenant}": administrator maria and members alice, bob, carol and dave (password ${USER_PASSWORD}), groups Team, Sales and Company, two calendars and an address book for alice, and a file.`,
);
