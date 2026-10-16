#!/usr/bin/env node
// Creates the users CalDAVTester/CardDAVTester log in as (user01 ... userNN,
// password = username, the suite's default) in a running DavNode and gives
// each the default calendar and addressbook the suites assume to exist
// (CalendarServer provisions them automatically; DavNode does not).
//
// Usage: provision-users.mjs <users.json>   — writes {username: {principalId}}
// Environment: CONFORMANCE_PORT, CONFORMANCE_TENANT, CONFORMANCE_USER,
// CONFORMANCE_PASSWORD (the bootstrap admin), CONFORMANCE_USER_COUNT.
/* global fetch */
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { writeFileSync } from 'node:fs';
import process from 'node:process';

const port = process.env.CONFORMANCE_PORT ?? '8080';
const tenant = process.env.CONFORMANCE_TENANT ?? 'ci';
const admin = process.env.CONFORMANCE_USER ?? 'ci';
const adminPassword = process.env.CONFORMANCE_PASSWORD ?? 'ci-password';
const count = Number(process.env.CONFORMANCE_USER_COUNT ?? '5');
const base = `http://127.0.0.1:${port}`;

const basic = (user, password) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

async function send(method, path, { auth, body, headers = {} }) {
  const response = await fetch(`${base}${path}`, {
    method,
    body,
    headers: { Authorization: auth, ...headers },
  });
  return response;
}

const ADDRESSBOOK_MKCOL = `<?xml version="1.0" encoding="utf-8"?>
<D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:set><D:prop>
    <D:resourcetype><D:collection/><C:addressbook/></D:resourcetype>
    <D:displayname>addressbook</D:displayname>
  </D:prop></D:set>
</D:mkcol>`;

const users = {};
for (let n = 1; n <= count; n += 1) {
  const username = `user${String(n).padStart(2, '0')}`;
  const created = await send('POST', `/admin/${tenant}/users`, {
    auth: basic(admin, adminPassword),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: username,
    }),
  });
  if (created.status !== 201) {
    console.error(
      `creating ${username} failed: ${created.status} ${await created.text()}`,
    );
    process.exit(1);
  }
  const { principalId } = await created.json();
  const auth = basic(username, username);
  const calendar = await send(
    'MKCALENDAR',
    `/dav/${tenant}/calendars/${principalId}/calendar`,
    { auth },
  );
  const book = await send(
    'MKCOL',
    `/dav/${tenant}/addressbooks/${principalId}/addressbook`,
    {
      auth,
      body: ADDRESSBOOK_MKCOL,
      headers: { 'Content-Type': 'application/xml' },
    },
  );
  if (calendar.status !== 201 || book.status !== 201) {
    console.error(
      `provisioning ${username}: calendar ${calendar.status}, addressbook ${book.status}`,
    );
    process.exit(1);
  }
  users[username] = { principalId };
}

writeFileSync(process.argv[2] ?? 'users.json', JSON.stringify(users, null, 2));
console.log(`provisioned ${count} users`);
