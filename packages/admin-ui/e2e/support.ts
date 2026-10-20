import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const TENANT = 'e2e';
const ADMIN = { username: 'admin', password: 'admin-pw' };
const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

/** Signs in through the login form and waits for the overview. */
export async function signIn(
  page: Page,
  username = ADMIN.username,
  password = ADMIN.password,
) {
  await page.goto('/admin-ui/');
  await page.getByLabel('Tenant').fill(TENANT);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Your account')).toBeVisible();
}

/** The Admin API as the bootstrapped administrator. */
export function adminApi(request: APIRequestContext) {
  const headers = {
    Authorization: basic(ADMIN.username, ADMIN.password),
    'Content-Type': 'application/json',
  };
  return {
    async post(path: string, data: unknown) {
      const response = await request.post(`/admin/${TENANT}${path}`, {
        headers,
        data,
      });
      expect(
        response.ok(),
        `${path}: ${response.status()} ${await response.text()}`,
      ).toBe(true);
      return response.json();
    },
    async get(path: string) {
      const response = await request.get(`/admin/${TENANT}${path}`, {
        headers,
      });
      expect(response.ok(), path).toBe(true);
      return response.json();
    },
  };
}

/** Creates a user through the API and returns their ids. */
export async function createUser(
  request: APIRequestContext,
  username: string,
  password = 'pw-' + username,
) {
  const user = await adminApi(request).post('/users', {
    username,
    email: `${username}@example.com`,
    password,
  });
  return { ...user, password } as {
    id: string;
    principalId: string;
    username: string;
    password: string;
  };
}

/** Sends a DAV request as `user` (MKCALENDAR, MKCOL and PUT have no Playwright helper of their own). */
export async function dav(
  request: APIRequestContext,
  user: { username: string; password: string },
  method: string,
  path: string,
  options: { body?: string; contentType?: string } = {},
) {
  const response = await request.fetch(`/dav/${TENANT}${path}`, {
    method,
    headers: {
      Authorization: basic(user.username, user.password),
      ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
    },
    data: options.body,
  });
  expect(response.status(), `${method} ${path}`).toBeLessThan(300);
}
