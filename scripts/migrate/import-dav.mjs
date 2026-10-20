// Imports calendars and address books from a directory tree of .ics / .vcf
// files into a DavNode user's account. Radicale's "filesystem" storage
// (<root>/collection-root/<user>/<collection>/*.ics|*.vcf) and exports from
// other servers have this shape. Idempotent: objects are written under the
// file name, so running it again overwrites instead of duplicating.
//
//   node scripts/migrate/import-dav.mjs --base https://dav.example.com \
//     --tenant demo --user alice --password '...' \
//     --source /path/to/collection-root/alice
//
// Each sub-directory of --source becomes a calendar (if it holds .ics files)
// or an address book (if it holds .vcf files) named like the directory. Only
// the objects are imported: sharing, ACLs, subscriptions and per-collection
// settings are not.
/* global fetch */
import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    base: { type: 'string' },
    tenant: { type: 'string' },
    user: { type: 'string' },
    password: { type: 'string' },
    source: { type: 'string' },
    'principal-id': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
for (const key of ['base', 'tenant', 'user', 'password', 'source']) {
  if (!args[key]) {
    console.error(`missing --${key} (see the header of this script)`);
    process.exit(2);
  }
}

const authorization =
  'Basic ' + Buffer.from(`${args.user}:${args.password}`).toString('base64');
const base = args.base.replace(/\/$/, '');

async function dav(method, url, options = {}) {
  const res = await fetch(base + url, {
    method,
    ...options,
    headers: { authorization, ...options.headers },
  });
  return res;
}

// The collection URLs contain the user's principal id: pass it with
// --principal-id, or let the script look it up (needs an account that may
// read /admin/{tenant}/users, i.e. a tenant administrator).
async function findPrincipalId() {
  if (args['principal-id']) return args['principal-id'];
  const res = await dav('GET', `/admin/${args.tenant}/users`);
  if (res.ok) {
    const match = (await res.json()).users.find(
      (u) => u.username === args.user,
    );
    if (match) return match.principalId;
  }
  throw new Error(
    `Cannot determine the principal id of ${args.user}: pass --principal-id ` +
      `(shown as "principalId" by GET /admin/${args.tenant}/users).`,
  );
}
const principalId = await findPrincipalId();

const MKCOL_ADDRESSBOOK = (name) =>
  `<?xml version="1.0"?><D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:set><D:prop><D:resourcetype><D:collection/><C:addressbook/></D:resourcetype><D:displayname>${name.replace(/[<&]/g, '')}</D:displayname></D:prop></D:set></D:mkcol>`;

let imported = 0;
let failed = 0;
for (const entry of await readdir(args.source, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = path.join(args.source, entry.name);
  const files = (await readdir(dir)).filter((f) => /\.(ics|vcf)$/i.test(f));
  const calendarFiles = files.filter((f) => /\.ics$/i.test(f));
  const contactFiles = files.filter((f) => /\.vcf$/i.test(f));
  if (calendarFiles.length > 0 && contactFiles.length > 0) {
    console.warn(`skip ${entry.name}: mixes .ics and .vcf files`);
    continue;
  }
  const isCalendar = calendarFiles.length > 0;
  if (!isCalendar && contactFiles.length === 0) continue;

  const slug = entry.name.replace(/[^A-Za-z0-9._-]/g, '-');
  const collection = isCalendar
    ? `/dav/${args.tenant}/calendars/${principalId}/${slug}/`
    : `/dav/${args.tenant}/addressbooks/${principalId}/${slug}/`;
  console.log(
    `${isCalendar ? 'calendar' : 'address book'} ${entry.name}: ${files.length} object(s) -> ${collection}`,
  );
  if (args['dry-run']) continue;

  // 405: the collection already exists, which is fine for a re-run.
  const created = isCalendar
    ? await dav('MKCALENDAR', collection)
    : await dav('MKCOL', collection, {
        headers: { 'content-type': 'application/xml' },
        body: MKCOL_ADDRESSBOOK(entry.name),
      });
  if (!created.ok && created.status !== 405) {
    console.error(
      `  cannot create the collection: ${created.status} ${await created.text()}`,
    );
    failed += files.length;
    continue;
  }

  for (const file of isCalendar ? calendarFiles : contactFiles) {
    const res = await dav('PUT', collection + encodeURIComponent(file), {
      headers: { 'content-type': isCalendar ? 'text/calendar' : 'text/vcard' },
      body: await readFile(path.join(dir, file)),
    });
    if (res.ok) {
      imported++;
    } else {
      failed++;
      console.error(
        `  ${file}: ${res.status} ${(await res.text()).slice(0, 200)}`,
      );
    }
  }
}
console.log(`Imported ${imported} object(s), ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
