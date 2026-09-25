import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarCollection,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { generateFeedToken, revokeFeedToken } from './feed-token.service.js';

describe('feed token service', () => {
  let dataSource: DataSource;
  let calendar: CalendarCollection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    const tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    const owner = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.id,
        name: 'work',
        displayName: 'Work',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  const reload = () =>
    dataSource
      .getRepository(CalendarCollection)
      .findOneByOrFail({ id: calendar.id });

  describe('generateFeedToken', () => {
    it('stores a random, URL-safe token on the calendar and returns it', async () => {
      const token = await generateFeedToken(dataSource, calendar.id);

      expect(token.length).toBeGreaterThanOrEqual(40);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      const stored = await reload();
      expect(stored.icsFeedToken).toBe(token);
    });

    it('returns a different token on every call, and the old one stops resolving', async () => {
      const first = await generateFeedToken(dataSource, calendar.id);
      const second = await generateFeedToken(dataSource, calendar.id);

      expect(second).not.toBe(first);
      const stored = await reload();
      expect(stored.icsFeedToken).toBe(second);
      expect(
        await dataSource
          .getRepository(CalendarCollection)
          .findOneBy({ icsFeedToken: first }),
      ).toBeNull();
    });
  });

  describe('revokeFeedToken', () => {
    it('clears the token, disabling the feed', async () => {
      await generateFeedToken(dataSource, calendar.id);

      await revokeFeedToken(dataSource, calendar.id);

      const stored = await reload();
      expect(stored.icsFeedToken).toBeNull();
    });
  });
});
