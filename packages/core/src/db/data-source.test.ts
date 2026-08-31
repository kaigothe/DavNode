import { describe, expect, it } from 'vitest';
import { createDataSource, createDataSourceOptions } from './data-source.js';

describe('createDataSource', () => {
  // Driven entirely by process.env, not a hardcoded override: with no
  // DAVNODE_DB_* variables set, this defaults to an in-memory SQLite
  // database (see createDataSourceOptions). Exporting DAVNODE_DB_TYPE=
  // postgres/mysql plus the matching connection variables runs this exact
  // same test against that engine instead — the DB-engine test matrix
  // (see milestones/M0-fundament/03-typeorm-database-setup/03-db-engine-test-matrix.md)
  // switches engines purely through the environment, not separate tests.
  it('initializes and closes against the configured database without any entities', async () => {
    const dataSource = createDataSource();

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
