import { describe, expect, it } from 'vitest';
import { createDataSource, createDataSourceOptions } from './data-source.js';

describe('createDataSource', () => {
  it('initializes and closes against an in-memory SQLite database without any entities', async () => {
    const dataSource = createDataSource({
      DAVNODE_DB_TYPE: 'better-sqlite3',
      DAVNODE_DB_FILE: ':memory:',
    });

    await dataSource.initialize();
    expect(dataSource.isInitialized).toBe(true);

    await dataSource.destroy();
    expect(dataSource.isInitialized).toBe(false);
  });

  it('defaults to an in-memory SQLite database when no type is given', () => {
    const options = createDataSourceOptions({});
    expect(options.type).toBe('better-sqlite3');
  });

  it('rejects an unsupported DAVNODE_DB_TYPE', () => {
    expect(() =>
      createDataSourceOptions({ DAVNODE_DB_TYPE: 'oracle' }),
    ).toThrow(/Unsupported DAVNODE_DB_TYPE/);
  });

  it('builds postgres options purely from environment variables', () => {
    const options = createDataSourceOptions({
      DAVNODE_DB_TYPE: 'postgres',
      DAVNODE_DB_HOST: 'db.example.com',
      DAVNODE_DB_PORT: '5433',
      DAVNODE_DB_NAME: 'davnode',
      DAVNODE_DB_USER: 'davnode',
      DAVNODE_DB_PASSWORD: 'secret',
    });

    expect(options).toMatchObject({
      type: 'postgres',
      host: 'db.example.com',
      port: 5433,
      username: 'davnode',
      password: 'secret',
      database: 'davnode',
    });
  });
});
