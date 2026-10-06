import { describe, expect, it } from 'vitest';
import type { User, UserRole } from '../../entities/user.entity.js';
import { requireRole } from './require-role.js';

function userWithRole(role: UserRole): User {
  return { role } as User;
}

describe('requireRole', () => {
  it('a tenant_admin minimum accepts both tenant_admin and server_admin, rejects member', () => {
    expect(requireRole(userWithRole('tenant_admin'), 'tenant_admin')).toBe(
      true,
    );
    expect(requireRole(userWithRole('server_admin'), 'tenant_admin')).toBe(
      true,
    );
    expect(requireRole(userWithRole('member'), 'tenant_admin')).toBe(false);
  });

  it('a server_admin minimum accepts only server_admin', () => {
    expect(requireRole(userWithRole('server_admin'), 'server_admin')).toBe(
      true,
    );
    expect(requireRole(userWithRole('tenant_admin'), 'server_admin')).toBe(
      false,
    );
    expect(requireRole(userWithRole('member'), 'server_admin')).toBe(false);
  });

  it('a member minimum accepts every role', () => {
    expect(requireRole(userWithRole('member'), 'member')).toBe(true);
    expect(requireRole(userWithRole('tenant_admin'), 'member')).toBe(true);
    expect(requireRole(userWithRole('server_admin'), 'member')).toBe(true);
  });
});
