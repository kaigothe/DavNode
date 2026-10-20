import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App';
import { AppProviders } from '../AppProviders';
import { initI18n } from '../i18n';

/** A fake Admin API: maps `METHOD /path` (without the tenant prefix) to a response. */
export type Routes = Record<
  string,
  (init: RequestInit) => Response | Promise<Response>
>;

/** Replaces `fetch` with {@link Routes}; unknown routes answer 404. */
export function stubApi(routes: Routes) {
  const calls: { path: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: URL | string, init: RequestInit = {}) => {
      const url = new URL(input.toString(), 'http://localhost');
      const path = url.pathname.replace(/^\/admin\/[^/]+/, '') + url.search;
      calls.push({ path, init });
      const handler = routes[`${init.method ?? 'GET'} ${path}`];
      return Promise.resolve(
        handler ? handler(init) : new Response(null, { status: 404 }),
      );
    }),
  );
  return calls;
}

/** Renders the whole app at `path`, in English unless a test changes it. */
export async function renderApp(path = '/') {
  await initI18n('en').changeLanguage('en');
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AppProviders>,
  );
}

export const adminMe = {
  id: 'u1',
  principalId: 'p1',
  username: 'boss',
  email: 'boss@example.com',
  role: 'tenant_admin',
  tenant: { id: 't1', slug: 'acme', name: 'Acme Corp' },
  anchorTenant: 'acme',
  capabilities: { contentView: false },
};

export const providers = {
  providers: [
    { id: 'basic', enabled: true },
    { id: 'digest', enabled: false },
    { id: 'oauth2', enabled: true },
  ],
  oauth2Issuers: ['https://id.example.com'],
};
