import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  Group,
  Principal,
  Tenant,
  User,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  detectSchedulingRole,
  extractSchedulingParticipants,
  resolveLocalPrincipalForAddress,
} from './detect-scheduling-role.js';

/** A VEVENT with the given ORGANIZER/ATTENDEE lines (already formatted, e.g. `mailto:x@y.com`), or none. */
function event(options: {
  organizer?: string;
  attendees?: string[];
  uid?: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'BEGIN:VEVENT',
    `UID:${options.uid ?? 'event-1'}`,
    'DTSTAMP:20260101T000000Z',
    'DTSTART:20260924T100000Z',
    'SUMMARY:Meeting',
  ];
  if (options.organizer) {
    lines.push(`ORGANIZER:${options.organizer}`);
  }
  for (const attendee of options.attendees ?? []) {
    lines.push(`ATTENDEE;PARTSTAT=NEEDS-ACTION:${attendee}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR', '');
  return lines.join('\r\n');
}

describe('extractSchedulingParticipants', () => {
  it('returns null organizer and no attendees for a plain event', () => {
    expect(extractSchedulingParticipants(event({}))).toEqual({
      organizer: null,
      attendees: [],
    });
  });

  it('returns the organizer and each attendee with its PARTSTAT', () => {
    const ics = event({
      organizer: 'mailto:alice@example.com',
      attendees: ['mailto:bob@example.com'],
    });

    expect(extractSchedulingParticipants(ics)).toEqual({
      organizer: 'mailto:alice@example.com',
      attendees: [
        { address: 'mailto:bob@example.com', partstat: 'NEEDS-ACTION' },
      ],
    });
  });
});

describe('detectSchedulingRole', () => {
  const ORGANIZER = 'mailto:alice@example.com';
  const ATTENDEE = 'mailto:bob@example.com';

  it("returns 'none' for an event without ATTENDEE", () => {
    const ics = event({ organizer: ORGANIZER });

    expect(detectSchedulingRole(ics, [ORGANIZER])).toBe('none');
  });

  it("returns 'organizer' when the ORGANIZER address matches the requesting principal", () => {
    const ics = event({ organizer: ORGANIZER, attendees: [ATTENDEE] });

    expect(detectSchedulingRole(ics, [ORGANIZER])).toBe('organizer');
  });

  it("returns 'attendee' when an ATTENDEE address matches, but not the ORGANIZER", () => {
    const ics = event({ organizer: ORGANIZER, attendees: [ATTENDEE] });

    expect(detectSchedulingRole(ics, [ATTENDEE])).toBe('attendee');
  });

  it("returns 'none' when neither ORGANIZER nor ATTENDEE matches (e.g. an admin editing someone else's calendar)", () => {
    const ics = event({ organizer: ORGANIZER, attendees: [ATTENDEE] });

    expect(detectSchedulingRole(ics, ['mailto:carol@example.com'])).toBe(
      'none',
    );
  });

  it('matches case-insensitively, including the mailto: scheme', () => {
    const ics = event({
      organizer: 'MAILTO:Alice@Example.com',
      attendees: [ATTENDEE],
    });

    expect(detectSchedulingRole(ics, ['mailto:alice@example.com'])).toBe(
      'organizer',
    );
  });
});

describe('resolveLocalPrincipalForAddress', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let otherTenant: Tenant;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    otherTenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'other', name: 'Other Inc.' }),
      );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function newUser(
    forTenant: Tenant,
    username: string,
    email: string,
  ): Promise<User> {
    const principal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: forTenant.id, kind: 'user', specialKind: null }),
      );
    return dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        principalId: principal.id,
        tenantId: forTenant.id,
        username,
        email,
        role: 'member',
      }),
    );
  }

  it('resolves a mailto: address to the matching local user, case-insensitively', async () => {
    const user = await newUser(tenant, 'alice', 'alice@example.com');

    const resolved = await resolveLocalPrincipalForAddress(
      dataSource.manager,
      'MAILTO:Alice@Example.com',
      tenant,
    );

    expect(resolved?.id).toBe(user.principalId);
  });

  it('returns null for a mailto: address matching no local user (external attendee)', async () => {
    await newUser(tenant, 'alice', 'alice@example.com');

    const resolved = await resolveLocalPrincipalForAddress(
      dataSource.manager,
      'mailto:stranger@elsewhere.example.com',
      tenant,
    );

    expect(resolved).toBeNull();
  });

  it("resolves a principal URL to the same tenant's user", async () => {
    const user = await newUser(tenant, 'alice', 'alice@example.com');

    const resolved = await resolveLocalPrincipalForAddress(
      dataSource.manager,
      `/dav/${tenant.slug}/principals/users/${user.principalId}`,
      tenant,
    );

    expect(resolved?.id).toBe(user.principalId);
  });

  it('returns null for a principal URL naming a user of a different tenant', async () => {
    const user = await newUser(otherTenant, 'alice', 'alice@example.com');

    const resolved = await resolveLocalPrincipalForAddress(
      dataSource.manager,
      `/dav/${otherTenant.slug}/principals/users/${user.principalId}`,
      tenant,
    );

    expect(resolved).toBeNull();
  });

  it('returns null for a group principal URL', async () => {
    const principal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'group', specialKind: null }),
      );
    const group = await dataSource.getRepository(Group).save(
      dataSource.getRepository(Group).create({
        principalId: principal.id,
        tenantId: tenant.id,
        name: 'engineering',
      }),
    );

    const resolved = await resolveLocalPrincipalForAddress(
      dataSource.manager,
      `/dav/${tenant.slug}/principals/groups/${group.principalId}`,
      tenant,
    );

    expect(resolved).toBeNull();
  });

  it('returns null for a malformed address', async () => {
    const resolved = await resolveLocalPrincipalForAddress(
      dataSource.manager,
      'not-an-address-at-all',
      tenant,
    );

    expect(resolved).toBeNull();
  });
});
