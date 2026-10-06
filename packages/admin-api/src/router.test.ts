import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  type DataSource,
} from '@davnode/core';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAdminRouter } from './router.js';

describe('createAdminRouter', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('mounts as a plain Express Router, answering 404 for any path since no routes exist yet', async () => {
    const app = express();
    app.use('/admin', createAdminRouter(dataSource));
    const server = app.listen(0);
    const address = server.address() as AddressInfo;

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/admin/anything`,
      );
      expect(response.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("doesn't throw when built repeatedly with different DataSources", () => {
    expect(() => createAdminRouter(dataSource)).not.toThrow();
  });
});
