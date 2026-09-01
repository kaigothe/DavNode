import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  ReportRegistry,
  TenantService,
  UserService,
  type DataSource,
  type ReportContext,
  type ReportHandler,
  type ReportResult,
} from '@davnode/core';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBasicAuthMiddleware } from '../basic-auth.middleware.js';
import { errorHandlerMiddleware } from '../error-handler.middleware.js';
import { createTenantResolutionMiddleware } from '../tenant-resolution.middleware.js';
import { registerReportRoute } from './report.route.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/** Records the context it was called with, so tests can assert the dispatcher actually threaded tenant/principal/manager through. */
class DummyReportHandler implements ReportHandler {
  calls: Array<{ requestXml: string; context: ReportContext }> = [];

  async handle(requestXml: string, context: ReportContext): Promise<ReportResult> {
    this.calls.push({ requestXml, context });
    return { status: 207, body: '<D:multistatus xmlns:D="DAV:"/>' };
  }
}

describe('REPORT route', () => {
  let dataSource: DataSource;
  let baseUrl: string;
  let server: ReturnType<express.Express['listen']>;
  let dummyHandler: DummyReportHandler;
  let registry: ReportRegistry;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    const tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });

    dummyHandler = new DummyReportHandler();
    registry = new ReportRegistry();
    registry.register('urn:example:ns', 'dummy-report', dummyHandler);

    const app = express();
    app.use('/dav/:tenantSlug', createTenantResolutionMiddleware(dataSource));
    app.use('/dav/:tenantSlug', createBasicAuthMiddleware(dataSource));
    registerReportRoute(app, dataSource, registry);
    app.use(errorHandlerMiddleware);

    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  async function report(path: string, body: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'REPORT',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'application/xml',
      },
      body,
    });
  }

  it('dispatches to a registered handler matching the request body root element', async () => {
    const body =
      '<dummy-report xmlns="urn:example:ns"><some-filter/></dummy-report>';

    const response = await report('/dav/acme/files', body);

    expect(response.status).toBe(207);
    expect(dummyHandler.calls).toHaveLength(1);
    expect(dummyHandler.calls[0]?.requestXml).toBe(body);
    expect(dummyHandler.calls[0]?.context.tenant.slug).toBe('acme');
    expect(dummyHandler.calls[0]?.context.principal.id).toBeTruthy();
  });

  it('dispatches based on the root element regardless of which resource the REPORT targets', async () => {
    const body =
      '<dummy-report xmlns="urn:example:ns"><some-filter/></dummy-report>';

    const responseOnFiles = await report('/dav/acme/files', body);
    const responseOnPrincipals = await report('/dav/acme/principals', body);

    expect(responseOnFiles.status).toBe(207);
    expect(responseOnPrincipals.status).toBe(207);
    expect(dummyHandler.calls).toHaveLength(2);
  });

  it('returns 415 with a <D:supported-report/> error body for an unregistered report type', async () => {
    const body =
      '<D:principal-property-search xmlns:D="DAV:"/>';

    const response = await report('/dav/acme/files', body);

    expect(response.status).toBe(415);
    const responseBody = await response.text();
    expect(responseBody).toContain('supported-report');
    expect(dummyHandler.calls).toHaveLength(0);
  });

  it('returns 400 for a missing or malformed body', async () => {
    const missingBodyResponse = await report('/dav/acme/files', '');
    expect(missingBodyResponse.status).toBe(400);

    const malformedResponse = await report(
      '/dav/acme/files',
      'not xml at all <<<',
    );
    expect(malformedResponse.status).toBe(400);

    expect(dummyHandler.calls).toHaveLength(0);
  });
});
