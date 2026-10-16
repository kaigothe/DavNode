#!/usr/bin/env node
// Turns CalDAVTester's CalendarServer-flavoured serverinfo.xml into one for
// DavNode (M11, milestones/M11-client-compatibility/06-conformance-suite-ci/
// 02-caldavtester-cardavtester-ci-integration.md).
//
// Usage: make-serverinfo.mjs <template serverinfo.xml> <users.json> <out.xml>
// Environment: CONFORMANCE_HOST (default localhost), CONFORMANCE_PORT
// (default 8080), CONFORMANCE_TENANT (default ci), CONFORMANCE_FEATURES
// (a path to a file with one feature per line, default: scripts/conformance/
// caldavtester-features.txt).
//
// What differs from CalendarServer, and is therefore rewritten:
//   - everything lives under /dav/{tenant}/ (path-prefix tenancy),
//   - a user's principal, calendar home and addressbook home are addressed by
//     the principal id, not by the "__uids__"/user-name URLs,
//   - the user ids are DavNode's, written by provision-users.mjs,
//   - the feature list names only what DavNode implements.
import console from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const [templatePath, usersPath, outPath] = process.argv.slice(2);
if (!templatePath || !usersPath || !outPath) {
  console.error('usage: make-serverinfo.mjs <template> <users.json> <out.xml>');
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.CONFORMANCE_HOST ?? 'localhost';
const port = process.env.CONFORMANCE_PORT ?? '8080';
const tenant = process.env.CONFORMANCE_TENANT ?? 'ci';
const featuresPath =
  process.env.CONFORMANCE_FEATURES ??
  path.join(here, 'caldavtester-features.txt');

let xml = readFileSync(templatePath, 'utf8');

const setTag = (tag, value) => {
  xml = xml.replace(
    new RegExp(`<${tag}>[^<]*</${tag}>`),
    `<${tag}>${value}</${tag}>`,
  );
};
setTag('host', host);
setTag('nonsslport', port);

/** Replaces the value of an existing top-level substitution (the first one with that key). */
const setSubstitution = (key, value) => {
  const pattern = new RegExp(
    `(<key>${key.replace(/[$.]/g, '\\$&')}</key>\\s*<value>)[^<]*(</value>)`,
  );
  if (!pattern.test(xml))
    throw new Error(`substitution ${key} not found in the template`);
  xml = xml.replace(pattern, `$1${value}$2`);
};

setSubstitution('$root:', `/dav/${tenant}/`);
// DavNode addresses homes by principal id: no "__uids__" level.
setSubstitution('$principals_uids:', '$principalcollection:users/');
setSubstitution('$calendars_uids:', '$calendars:');
setSubstitution('$addressbooks_uids:', '$addressbooks:');

const features = readFileSync(featuresPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.replace(/#.*/, '').trim())
  .filter(Boolean)
  .map((feature) => `\t\t<feature>${feature}</feature>`)
  .join('\n');
xml = xml.replace(
  /<features>[\s\S]*?<\/features>/,
  `<features>\n${features}\n\t</features>`,
);

// The user ids come last so they override the template's fixed GUIDs.
const users = JSON.parse(readFileSync(usersPath, 'utf8'));
const overrides = Object.entries(users)
  .map(([username, { principalId }]) => {
    const n = Number(username.replace(/\D/g, ''));
    return `\t\t<substitution>\n\t\t\t<key>$userguid${n}:</key>\n\t\t\t<value>${principalId}</value>\n\t\t</substitution>`;
  })
  .join('\n');
xml = xml.replace('</substitutions>', `${overrides}\n\t</substitutions>`);

writeFileSync(outPath, xml);
console.log(`wrote ${outPath} for ${Object.keys(users).length} users`);
