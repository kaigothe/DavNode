import { describe, expect, it } from 'vitest';
import { requestViolations, responseViolations } from './contract';

const id = '00000000-0000-4000-8000-000000000001';
const me = {
  id,
  principalId: id,
  username: 'boss',
  email: 'boss@example.com',
  role: 'tenant_admin',
  tenant: { id, slug: 'acme', name: 'Acme' },
  anchorTenant: 'acme',
  capabilities: { contentView: false, logView: false },
};

describe('the contract check of the fake API', () => {
  it('accepts a response that matches the document', () => {
    expect(responseViolations('GET', '/me', 200, me)).toEqual([]);
  });

  it('reports a missing property', () => {
    const rest = Object.fromEntries(
      Object.entries(me).filter(([key]) => key !== 'email'),
    );

    expect(responseViolations('GET', '/me', 200, rest)).toEqual([
      expect.stringContaining("must have required property 'email'"),
    ]);
  });

  it('reports a wrong type and a value outside an enum', () => {
    const violations = responseViolations('GET', '/me', 200, {
      ...me,
      role: 'boss',
      capabilities: { contentView: 'yes', logView: false },
    });

    expect(violations.join('\n')).toMatch(/role must be equal to one of/);
    expect(violations.join('\n')).toMatch(/contentView must be boolean/);
  });

  it('reports an id that is not a UUID', () => {
    expect(responseViolations('GET', '/me', 200, { ...me, id: 'u1' })).toEqual([
      expect.stringContaining('format "uuid"'),
    ]);
  });

  it('knows nullable values', () => {
    const user = {
      id,
      principalId: id,
      username: 'a',
      email: 'a@b.c',
      role: 'member',
      quotaLimitBytes: null,
      quotaUsedBytes: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    expect(
      responseViolations('GET', '/users/{id}'.replace('{id}', id), 200, user),
    ).toEqual([]);
  });

  it('prefers a literal path over a parameter (effective members)', () => {
    expect(
      responseViolations('GET', `/groups/${id}/members/effective`, 200, {
        members: [{ principalId: id, kind: 'user', name: 'bob' }],
      }),
    ).toEqual([]);
  });

  it('resolves shared responses (a documented 403 error)', () => {
    expect(
      responseViolations('GET', '/tenants', 403, {
        error: { code: 'insufficient_role', message: 'x' },
      }),
    ).toEqual([]);
  });

  it('judges a documented success status that does not exist, not an error status', () => {
    expect(responseViolations('GET', '/me', 201, me)).toHaveLength(1);
    expect(responseViolations('GET', '/me', 500, {})).toEqual([]);
  });

  it('ignores routes the document does not know', () => {
    expect(responseViolations('GET', '/nope', 200, {})).toEqual([]);
  });

  it('checks request bodies as well', () => {
    expect(requestViolations('POST', '/groups', { name: 'Dev' })).toEqual([]);
    expect(requestViolations('POST', '/groups', {})).toEqual([
      expect.stringContaining("must have required property 'name'"),
    ]);
    expect(
      requestViolations('DELETE', `/tenants/acme`, { confirmSlug: 'acme' }),
    ).toEqual([]);
    expect(requestViolations('DELETE', `/tenants/acme`, {})).toHaveLength(1);
  });
});
