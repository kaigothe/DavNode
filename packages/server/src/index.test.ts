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
});

describe('shutdown', () => {
  it('closes the HTTP server and destroys the DataSource', async () => {
    const running = await startServer({ env: { DAVNODE_HTTP_PORT: '0' } });
    const address = running.server.address() as AddressInfo;

    await shutdown(running);

    expect(running.dataSource.isInitialized).toBe(false);
    await expect(fetch(`http://127.0.0.1:${address.port}/`)).rejects.toThrow();
  });
});
