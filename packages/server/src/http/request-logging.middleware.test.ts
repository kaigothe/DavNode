import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  setLogSink,
  TenantService,
  UserService,
  type DataSource,
  type User,
} from '@davnode/core';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createLogger, toLogSink } from '../logging/logger.js';
import {
  createRequestLoggingMiddleware,
  redactPath,
} from './request-logging.middleware.js';

const PASSWORD = 'Pa55word-that-must-never-be-logged';

function capture(level: Parameters<typeof createLogger>[0]) {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(...chunk.toString().split('\n').filter(Boolean));
      callback();
    },
  });
  return {
    logger: createLogger(level, stream),
    lines,
    entries: () =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('request logging', () => {
  let dataSource: DataSource;
  let alice: User;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;
  let baseUrl: string;
  let log: ReturnType<typeof capture>;

  async function start(level: Parameters<typeof createLogger>[0]) {
    log = capture(level);
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    const tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme',
    });
    alice = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
      role: 'server_admin',
    });
    // What the real server does at startup: core and the error handlers
    // write to the same logger.
    setLogSink(toLogSink(log.logger));
    server = createApp(dataSource, { logger: log.logger }).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  afterEach(async () => {
    setLogSink();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  const auth = (password = PASSWORD) =>
    `Basic ${Buffer.from(`alice:${password}`).toString('base64')}`;

  describe('at info level', () => {
    beforeEach(() => start('info'));

    it('logs one JSON line per request with method, path, status, duration, tenant and principal', async () => {
      await fetch(`${baseUrl}/dav/acme/principals/?secret=query-value`, {
        method: 'PROPFIND',
        headers: { Authorization: auth(), Depth: '0' },
      });

      const entry = log
        .entries()
        .find((e) => e['message'] === 'request completed')!;
      expect(entry).toMatchObject({
        level: 'info',
        method: 'PROPFIND',
        path: '/dav/acme/principals/',
        status: 207,
        tenantSlug: 'acme',
        principalId: alice.principalId,
      });
      expect(entry['durationMs']).toBeGreaterThanOrEqual(0);
      expect(entry['requestId']).toMatch(/^[0-9a-f-]{36}$/);
      expect(Date.parse(entry['timestamp'] as string)).not.toBeNaN();
    });

    it('returns the request id as X-Request-Id, a fresh one each time, and ignores a client-supplied one', async () => {
      const first = await fetch(`${baseUrl}/healthz`, {
        headers: { 'X-Request-Id': 'attacker-chosen' },
      });
      const second = await fetch(`${baseUrl}/healthz`);

      expect(first.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
      expect(first.headers.get('x-request-id')).not.toBe('attacker-chosen');
      expect(first.headers.get('x-request-id')).not.toBe(
        second.headers.get('x-request-id'),
      );
    });

    it('logs an unauthenticated 401 as well, without a principal', async () => {
      await fetch(`${baseUrl}/dav/acme/files/`);

      const entry = log.entries().find((e) => e['status'] === 401)!;
      expect(entry).toMatchObject({
        tenantSlug: 'acme',
        path: '/dav/acme/files/',
      });
      expect(entry).not.toHaveProperty('principalId');
    });

    it('keeps the probe out of the log at info level', async () => {
      await fetch(`${baseUrl}/healthz`);

      expect(log.lines).toHaveLength(0);
    });

    it('shares the request id between the request line and a line written while handling it', async () => {
      // An unexpected failure is logged by the error handler, inside the
      // request: here the tables vanish under a running server.
      await dataSource.query('DROP TABLE credentials');
      const response = await fetch(`${baseUrl}/dav/acme/files/`, {
        headers: { Authorization: auth() },
      });
      expect(response.status).toBe(500);

      const entries = log.entries();
      const failure = entries.find((e) => e['message'] === 'Unhandled error')!;
      const completed = entries.find(
        (e) => e['message'] === 'request completed' && e['status'] === 500,
      )!;
      expect(failure['requestId']).toBeTruthy();
      expect(failure['requestId']).toBe(completed['requestId']);
    });
  });

  it('never logs a password, a hash or an Authorization header, even at debug level', async () => {
    await start('debug');

    // Right and wrong credentials, a password in a request body and in the URL.
    await fetch(`${baseUrl}/dav/acme/principals/`, {
      method: 'PROPFIND',
      headers: { Authorization: auth(), Depth: '0' },
    });
    await fetch(`${baseUrl}/dav/acme/principals/`, {
      method: 'PROPFIND',
      headers: { Authorization: auth('wrong-Pa55word-guess'), Depth: '0' },
    });
    await fetch(`${baseUrl}/admin/acme/users?password=${PASSWORD}`, {
      method: 'POST',
      headers: {
        Authorization: auth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'bob',
        email: 'bob@example.com',
        password: PASSWORD,
      }),
    });
    await fetch(`${baseUrl}/dav/acme/files/notes.txt`, {
      method: 'PUT',
      headers: { Authorization: auth() },
      body: PASSWORD,
    });

    const everything = log.lines.join('\n');
    expect(log.lines.length).toBeGreaterThan(3);
    expect(everything).not.toContain(PASSWORD.slice(0, 12));
    expect(everything).not.toContain('wrong-Pa55word-guess');
    expect(everything).not.toContain(auth().slice(6));
    expect(everything).not.toContain(auth('wrong-Pa55word-guess').slice(6));
    expect(everything.toLowerCase()).not.toContain('argon2');
  });

  it('suppresses info lines at error level', async () => {
    await start('error');

    await fetch(`${baseUrl}/dav/acme/principals/`, {
      method: 'PROPFIND',
      headers: { Authorization: auth(), Depth: '0' },
    });

    expect(log.lines).toHaveLength(0);
  });

  it('logs the probe at debug level', async () => {
    await start('debug');

    await fetch(`${baseUrl}/healthz`);

    expect(log.entries()[0]).toMatchObject({ path: '/healthz', status: 200 });
  });
});

describe('redactPath', () => {
  it('hides the secret ICS feed token and leaves ordinary paths alone', () => {
    expect(redactPath('/dav/acme/calendars/u/work/feed/3f9a8c1d.ics')).toBe(
      '/dav/acme/calendars/u/work/feed/[redacted]',
    );
    expect(redactPath('/dav/acme/calendars/u/work/event.ics')).toBe(
      '/dav/acme/calendars/u/work/event.ics',
    );
  });
});

describe('createRequestLoggingMiddleware', () => {
  it('works on its own, in front of any app', async () => {
    const log = capture('info');
    const app = express();
    app.use(createRequestLoggingMiddleware(log.logger));
    app.get('/x', (_req, res) => {
      log.logger.info('inside the handler');
      res.send('ok');
    });
    const server = app.listen(0);
    try {
      await fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/x`,
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    const [inside, completed] = log.entries();
    expect(inside!['message']).toBe('inside the handler');
    expect(inside!['requestId']).toBeTruthy();
    expect(completed!['requestId']).toBe(inside!['requestId']);
  });
});
