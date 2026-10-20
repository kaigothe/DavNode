// Fails when the built admin UI grows past its budget (M14). Sizes are
// gzipped, which is what a browser downloads. "Initial" is everything the
// login page loads (index.html's script and preloaded modules); the pages
// behind it are lazy chunks with their own, smaller limit.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KB = 1024;
const BUDGET = {
  initial: 380 * KB,
  anyLazyChunk: 100 * KB,
  total: 700 * KB,
};

const dist = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
);
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
const initialFiles = new Set(
  [...html.matchAll(/(?:src|href)="\/admin-ui\/(assets\/[^"]+\.js)"/g)].map(
    (m) => m[1],
  ),
);
if (initialFiles.size === 0) {
  console.error('No scripts found in dist/index.html; build the UI first.');
  process.exit(2);
}

const assets = readdirSync(path.join(dist, 'assets')).filter((f) =>
  f.endsWith('.js'),
);
const size = (file) =>
  gzipSync(readFileSync(path.join(dist, 'assets', file))).length;
const sizes = new Map(assets.map((f) => [f, size(f)]));

const initial = [...initialFiles].reduce(
  (sum, f) => sum + (sizes.get(path.basename(f)) ?? 0),
  0,
);
const total = [...sizes.values()].reduce((a, b) => a + b, 0);
const lazy = assets.filter((f) => !initialFiles.has(`assets/${f}`));
const biggestLazy = lazy
  .map((f) => [f, sizes.get(f)])
  .sort((a, b) => b[1] - a[1])[0];

const kb = (n) => `${(n / KB).toFixed(1)} kB`;
const failures = [];
const report = (name, value, limit) => {
  const ok = value <= limit;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(22)} ${kb(value).padStart(10)} / ${kb(limit)}`,
  );
  if (!ok) failures.push(name);
};
report('initial (gzip)', initial, BUDGET.initial);
report(`biggest lazy chunk`, biggestLazy?.[1] ?? 0, BUDGET.anyLazyChunk);
report('all scripts (gzip)', total, BUDGET.total);
if (biggestLazy) console.log(`     (biggest lazy chunk: ${biggestLazy[0]})`);
process.exit(failures.length ? 1 : 0);
