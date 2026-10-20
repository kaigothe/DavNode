import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App';
import { AppProviders } from '../AppProviders';
import { initI18n } from '../i18n';
import {
  recordViolations,
  requestViolations,
  responseViolations,
} from './contract';

/** A fake Admin API: maps `METHOD /path` (without the tenant prefix, with or without the query) to a response. */
export type Routes = Record<
  string,
  (request: {
    init: RequestInit;
    body: unknown;
    url: URL;
  }) => Response | Promise<Response>
>;

/** One request the app made to the fake API. */
export interface Call {
  method: string;
  path: string;
  /** The path with its query string. */
  full: string;
  body: unknown;
}

/** Replaces `fetch` with {@link Routes}; unknown routes answer 404. Returns the recorded calls. */
export function stubApi(routes: Routes) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: URL | string, init: RequestInit = {}) => {
      const url = new URL(input.toString(), 'http://localhost');
      const path = url.pathname.replace(/^\/admin\/[^/]+/, '');
      const full = path + url.search;
      const method = init.method ?? 'GET';
      const body =
        typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path, full, body });
      const handler =
        routes[`${method} ${full}`] ?? routes[`${method} ${path}`];
      if (body !== undefined) {
        recordViolations(requestViolations(method, path, body));
      }
      return Promise.resolve(
        handler
          ? handler({ init, body, url })
          : new Response(null, { status: 404 }),
      ).then(async (response) => {
        // Keep the fakes honest: they must answer as the documented API does.
        if (response.headers.get('content-type')?.includes('json')) {
          recordViolations(
            responseViolations(
              method,
              path,
              response.status,
              await response.clone().json(),
            ),
          );
        }
        return response;
      });
    }),
  );
  return calls;
}

/** Remembers a login for the tab, as if the user had signed in before. */
export function signedInAs(tenantSlug = 'acme', username = 'boss') {
  window.sessionStorage.setItem(
    'davnode.session',
    JSON.stringify({ tenantSlug, username, authorization: 'Basic x' }),
  );
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

/** An error response in the Admin API's format. */
export const apiError = (status: number, code: string, message = code) =>
  Response.json({ error: { code, message } }, { status });

export const adminMe = {
  id: '00000000-0000-4000-8000-0000000000a1',
  principalId: '00000000-0000-4000-8000-0000000000b1',
  username: 'boss',
  email: 'boss@example.com',
  role: 'tenant_admin',
  tenant: {
    id: '00000000-0000-4000-8000-0000000000e1',
    slug: 'acme',
    name: 'Acme Corp',
  },
  anchorTenant: 'acme',
  capabilities: { contentView: false, logView: false },
};

export const providers = {
  providers: [
    { id: 'basic', enabled: true },
    { id: 'digest', enabled: false },
    { id: 'oauth2', enabled: true },
  ],
  oauth2Issuers: ['https://id.example.com'],
};

export const serverAdminMe = { ...adminMe, role: 'server_admin' };

/** The base routes every logged-in test needs. */
export const baseRoutes = (me: object = adminMe): Routes => ({
  'GET /me': () => Response.json(me),
  'GET /providers': () => Response.json(providers),
});

export const user = (over: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-0000000000a2',
  principalId: '00000000-0000-4000-8000-0000000000b2',
  username: 'alice',
  email: 'alice@example.com',
  role: 'member',
  quotaLimitBytes: null,
  quotaUsedBytes: 1024,
  createdAt: '2026-01-02T10:00:00.000Z',
  ...over,
});

/**
 * Clicks the option `label` of an open Ant Design select. The options with
 * `role="option"` belong to a hidden list for screen readers and are not
 * clickable; the visible ones are matched by their content class.
 */
export async function chooseOption(
  user: { click: (element: Element) => Promise<void> },
  label: string,
) {
  const { screen } = await import('@testing-library/react');
  await user.click(
    await screen.findByText(label, {
      selector: '.ant-select-item-option-content',
    }),
  );
}
