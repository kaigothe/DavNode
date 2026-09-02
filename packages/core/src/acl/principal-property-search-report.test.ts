import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_ENTITIES, Principal, Tenant } from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { GroupService } from '../services/group.service.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';
import type { ReportContext } from '../webdav/report-registry.js';
import {
  parsePrincipalPropertySearchRequestBody,
  PrincipalPropertySearchReportHandler,
} from './principal-property-search-report.js';

const PASSWORD = 'correct horse battery staple';

function requestBody(match: string, propertyName = 'displayname'): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:principal-property-search xmlns:D="DAV:">
  <D:property-search>
    <D:prop><D:${propertyName}/></D:prop>
    <D:match>${match}</D:match>
  </D:property-search>
</D:principal-property-search>`;
}

function hrefsInMultistatus(xml: string): string[] {
  const matches = [...xml.matchAll(/<D:href>([^<]*)<\/D:href>/g)];
  return matches.map((m) => m[1] ?? '');
}

describe('parsePrincipalPropertySearchRequestBody', () => {
  it('parses a single property-search block with one property and a match value', () => {
    const parsed = parsePrincipalPropertySearchRequestBody(requestBody('Alice'));

    expect(parsed.searches).toEqual([
      {
        properties: [{ namespace: 'DAV:', name: 'displayname' }],
        match: 'Alice',
      },
    ]);
  });

  it('throws for a non-principal-property-search root element', () => {
    expect(() =>
      parsePrincipalPropertySearchRequestBody(
        '<D:propfind xmlns:D="DAV:"/>',
      ),
    ).toThrow(/Expected a DAV:principal-property-search root element/);
  });
});

describe('PrincipalPropertySearchReportHandler', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let handler: PrincipalPropertySearchReportHandler;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    handler = new PrincipalPropertySearchReportHandler();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function context(principal: Principal): ReportContext {
    return { tenant, principal, manager: dataSource.manager, segments: [] };
  }

  it('finds the matching user principal by a substring of displayname', async () => {
    const alice = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice-wonderland',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    const alicePrincipal = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: alice.principalId });

    const result = await handler.handle(
      requestBody('wonder'),
      context(alicePrincipal),
    );

    expect(result.status).toBe(207);
    expect(result.body).toContain('alice-wonderland');
    expect(hrefsInMultistatus(result.body)).toEqual([
      `/dav/acme/principals/users/${alice.principalId}`,
    ]);
  });

  it('matches case-insensitively and finds group principals too', async () => {
    const group = await new GroupService(dataSource).createGroup({
      tenantId: tenant.id,
      name: 'Engineering Team',
    });
    const requester = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'requester',
      email: 'requester@example.com',
      password: PASSWORD,
    });
    const requesterPrincipal = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: requester.principalId });

    const result = await handler.handle(
      requestBody('ENGINEERING'),
      context(requesterPrincipal),
    );

    expect(hrefsInMultistatus(result.body)).toEqual([
      `/dav/acme/principals/groups/${group.principalId}`,
    ]);
  });

  it('never returns matches from a different tenant', async () => {
    const otherTenant = await new TenantService(dataSource).createTenant({
      slug: 'other',
      name: 'Other Inc.',
    });
    await new UserService(dataSource).createUser({
      tenantId: otherTenant.id,
      username: 'alice-in-other-tenant',
      email: 'alice-other@example.com',
      password: PASSWORD,
    });
    const requester = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'requester',
      email: 'requester@example.com',
      password: PASSWORD,
    });
    const requesterPrincipal = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: requester.principalId });

    const result = await handler.handle(
      requestBody('alice'),
      context(requesterPrincipal),
    );

    expect(result.status).toBe(207);
    expect(hrefsInMultistatus(result.body)).toEqual([]);
  });

  it('returns a valid, empty 207 multistatus body when nothing matches', async () => {
    const requester = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'requester',
      email: 'requester@example.com',
      password: PASSWORD,
    });
    const requesterPrincipal = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: requester.principalId });

    const result = await handler.handle(
      requestBody('no-such-substring-anywhere'),
      context(requesterPrincipal),
    );

    expect(result.status).toBe(207);
    expect(result.body).toContain('<D:multistatus');
    expect(hrefsInMultistatus(result.body)).toEqual([]);
  });
});
