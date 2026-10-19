// Small load test for sizing guidance (docs/operations/handbook.md). Runs a
// mixed workload (file PUT/GET, PROPFIND) with N concurrent virtual users
// against a running DavNode and prints throughput and latency percentiles.
// It measures one machine; use it to compare your own hardware, not as a
// benchmark of DavNode in general.
//
//   node scripts/loadtest/run.mjs http://localhost:8080 demo admin 'password' \
//     [--users 20] [--seconds 20] [--size 10240]
/* global fetch */
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { parseArgs } from 'node:util';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    users: { type: 'string', default: '20' },
    seconds: { type: 'string', default: '20' },
    size: { type: 'string', default: '10240' },
  },
});
const [base, tenant, user, password] = positionals;
if (!password) {
  console.error(
    'usage: run.mjs <base-url> <tenant> <user> <password> [--users N] [--seconds N] [--size BYTES]',
  );
  process.exit(2);
}
const users = Number(values.users);
const seconds = Number(values.seconds);
const body = Buffer.alloc(Number(values.size), 'x');
const authorization =
  'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
const root = `${base}/dav/${tenant}/files`;

const latencies = [];
let errors = 0;
const stop = Date.now() + seconds * 1000;

async function timed(method, url, init = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method,
      ...init,
      headers: { authorization, ...init.headers },
    });
    await res.arrayBuffer();
    if (!res.ok) errors++;
  } catch {
    errors++;
  }
  latencies.push(performance.now() - t0);
}

await fetch(`${root}/loadtest/`, {
  method: 'MKCOL',
  headers: { authorization },
});

async function worker(id) {
  let n = 0;
  while (Date.now() < stop) {
    const url = `${root}/loadtest/u${id}-${n++ % 20}.bin`;
    await timed('PUT', url, { body });
    await timed('GET', url);
    await timed('PROPFIND', `${root}/loadtest/`, { headers: { depth: '1' } });
  }
}
await Promise.all(Array.from({ length: users }, (_, i) => worker(i)));
await fetch(`${root}/loadtest/`, {
  method: 'DELETE',
  headers: { authorization },
});

latencies.sort((a, b) => a - b);
const pct = (p) =>
  latencies[
    Math.min(latencies.length - 1, Math.floor(latencies.length * p))
  ].toFixed(1);
console.log(
  `users=${users} seconds=${seconds} size=${values.size}B requests=${latencies.length} ` +
    `req/s=${(latencies.length / seconds).toFixed(0)} errors=${errors} ` +
    `p50=${pct(0.5)}ms p95=${pct(0.95)}ms p99=${pct(0.99)}ms`,
);
process.exit(errors > 0 ? 1 : 0);
