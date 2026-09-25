import { IsNull, type DataSource } from 'typeorm';
import { createOwnerAllAce } from '../acl/create-owner-ace.js';
import { CalendarCollection } from '../entities/calendar-collection.entity.js';
import { CalendarProperty } from '../entities/calendar-property.entity.js';
import { User } from '../entities/user.entity.js';
import type { CalendarInitialization } from './mkcalendar-properties.js';

/** Everything {@link createCalendarCollection} needs to create one calendar. */
export interface NewCalendar {
  /** The tenant the calendar belongs to. */
  tenantId: string;
  /** The principal that owns the calendar and gets the default-owner ACE. */
  ownerPrincipalId: string;
  /** The URL path segment, unique among the owner's calendars. */
  name: string;
  /** The state `MKCALENDAR` initializes (see `interpretMkcalendarProperties`). */
  initialization: CalendarInitialization;
}

/**
 * Creates a `CalendarCollection` with everything `MKCALENDAR` sets up, in
 * one transaction (RFC 4791 §5.3.1: "If a MKCALENDAR request fails, the
 * server state preceding the request MUST be restored"): the row itself
 * (`displayName` defaulting to `name`, `supportedComponentSet` as given),
 * its client-defined dead properties (`calendar_properties`), the
 * default-owner ACE — without which the owner could not even read their
 * own new calendar (RFC 3744 is default-deny) — and, if this is the
 * owner's first calendar, their `User.defaultCalendarId`
 * (planning/01-decisions.md, Runde 22, M7): a conditional
 * `UPDATE ... WHERE default_calendar_id IS NULL` in the same
 * transaction, so it is set exactly once, atomically with the calendar
 * that becomes it, even under two concurrent `MKCALENDAR`s for the same
 * first-time owner.
 *
 * @returns The created calendar.
 * @throws The database's unique-constraint error if the owner already
 * has a calendar of that `name` (see `isUniqueConstraintViolationError`),
 * after rolling everything back.
 */
export async function createCalendarCollection(
  dataSource: DataSource,
  input: NewCalendar,
): Promise<CalendarCollection> {
  const { initialization } = input;
  return dataSource.transaction(async (manager) => {
    const calendars = manager.getRepository(CalendarCollection);
    const calendar = await calendars.save(
      calendars.create({
        tenantId: input.tenantId,
        ownerPrincipalId: input.ownerPrincipalId,
        name: input.name,
        displayName: initialization.displayName ?? input.name,
        description: initialization.description,
        timezone: initialization.timezone,
        supportedComponentSet: initialization.supportedComponentSet,
      }),
    );

    const properties = manager.getRepository(CalendarProperty);
    for (const property of initialization.deadProperties) {
      await properties.save(
        properties.create({ calendarId: calendar.id, ...property }),
      );
    }

    await createOwnerAllAce(
      manager,
      'calendar',
      calendar.id,
      input.ownerPrincipalId,
    );

    await manager
      .getRepository(User)
      .update(
        { principalId: input.ownerPrincipalId, defaultCalendarId: IsNull() },
        { defaultCalendarId: calendar.id },
      );

    return calendar;
  });
}
