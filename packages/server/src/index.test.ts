import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { shutdown, startServer, type RunningServer } from './index.js';

describe('startServer', () => {
  let running: RunningServer | undefined;

  afterEach(async () => {
    if (running) {
      await shutdown(running);
      running = undefined;
    }
  });

  it('initializes the DataSource before listening, on an OS-assigned port', async () => {
    running = await startServer({ env: { DAVNODE_HTTP_PORT: '0' } });

    expect(running.dataSource.isInitialized).toBe(true);
    const address = running.server.address() as AddressInfo;
    expect(address.port).toBeGreaterThan(0);
  });

  it('responds to an unmatched path instead of crashing (no routes mounted yet)', async () => {
    running = await startServer({ env: { DAVNODE_HTTP_PORT: '0' } });
    const address = running.server.address() as AddressInfo;

    const response = await fetch(
      `http://127.0.0.1:${address.port}/does-not-exist`,
    );
    expect(response.status).toBe(404);
  });

  it('rejects, and never starts listening, when the database connection fails', async () => {
    await expect(
      startServer({
        env: {
          DAVNODE_HTTP_PORT: '0',
          DAVNODE_DB_TYPE: 'better-sqlite3',
          DAVNODE_DB_FILE: '/nonexistent-directory-xyz-123/db.sqlite',
        },
      }),
    ).rejects.toThrow();
  });

  it('runs the Digest nonce sweep only when digest is enabled, and shuts it down', async () => {
    const withDigest = await startServer({
      env: { DAVNODE_HTTP_PORT: '0', DAVNODE_AUTH_PROVIDERS: 'basic,digest' },
    });
    expect(withDigest.digestNonceSweepTask).toBeDefined();
    await shutdown(withDigest);

    running = await startServer({ env: { DAVNODE_HTTP_PORT: '0' } });
    expect(running.digestNonceSweepTask).toBeUndefined();
  });

  describe('shutdown', () => {
    it('closes the HTTP server and destroys the DataSource', async () => {
      const running = await startServer({ env: { DAVNODE_HTTP_PORT: '0' } });
      const address = running.server.address() as AddressInfo;

      await shutdown(running);

      expect(running.dataSource.isInitialized).toBe(false);
      await expect(
        fetch(`http://127.0.0.1:${address.port}/`),
      ).rejects.toThrow();
    });

    it('applies pending migrations at startup, so a fresh database works', async () => {
      running = await startServer({ env: { DAVNODE_HTTP_PORT: '0' } });

      const rows = await running.dataSource.query(
        'SELECT COUNT(*) AS n FROM tenants',
      );

      expect(Number(rows[0].n)).toBe(0);
    });

    it('leaves the schema alone with DAVNODE_RUN_MIGRATIONS=false', async () => {
      running = await startServer({
        env: { DAVNODE_HTTP_PORT: '0', DAVNODE_RUN_MIGRATIONS: 'false' },
      });

      await expect(
        running.dataSource.query('SELECT COUNT(*) AS n FROM tenants'),
      ).rejects.toThrow(/no such table/i);
    });

    it('rejects startup, before opening any database, when oauth2 is enabled without issuers', async () => {
      await expect(
        startServer({
          env: {
            DAVNODE_HTTP_PORT: '0',
            DAVNODE_AUTH_PROVIDERS: 'basic,oauth2',
          },
        }),
      ).rejects.toThrow(/DAVNODE_OAUTH2_ISSUERS/);
    });

    it('rejects startup for an unknown auth provider', async () => {
      await expect(
        startServer({
          env: { DAVNODE_HTTP_PORT: '0', DAVNODE_AUTH_PROVIDERS: 'ntlm' },
        }),
      ).rejects.toThrow(/Unknown auth provider "ntlm"/);
    });
  });
});
