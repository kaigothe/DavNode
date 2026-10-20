import ICAL from 'ical.js';
import { In, type DataSource } from 'typeorm';
import { parseVCard, type ParsedVCard } from '../carddav/vcard-parser.js';
import { FLOATING_TIME_OFFSET_BOUNDS_MS } from '../caldav/index-calendar-object.js';
import { startMs, type TimeResolution } from '../caldav/calendar-time.js';
import { ZoneRegistry } from '../caldav/calendar-zones.js';
import { expandOccurrences } from '../caldav/expand-recurrence.js';
import {
  parseCalendarObject,
  type ParsedCalendarObject,
} from '../caldav/icalendar-parser.js';
import { AddressObjectContent } from '../entities/address-object-content.entity.js';
import { AddressObjectIndex } from '../entities/address-object-index.entity.js';
import { AddressObject } from '../entities/address-object.entity.js';
import { AddressbookCollection } from '../entities/addressbook-collection.entity.js';
import { CalendarCollection } from '../entities/calendar-collection.entity.js';
import { CalendarObjectContent } from '../entities/calendar-object-content.entity.js';
import {
  CalendarObject,
  type CalendarStatus,
  type CalendarTransparency,
} from '../entities/calendar-object.entity.js';

/** The longest time window {@link ContentInspectionService.listEvents} accepts. */
export const MAX_EVENT_WINDOW_MS = 366 * 24 * 3_600_000;

/** Calendar objects examined per {@link ContentInspectionService.listEvents} call. */
export const MAX_EVENT_OBJECTS = 5_000;

/** Event instances returned per {@link ContentInspectionService.listEvents} call. */
export const MAX_EVENT_INSTANCES = 5_000;

/** A calendar of a user, with the number of objects it holds. */
export interface InspectedCalendar {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  timezone: string | null;
  objectCount: number;
  updatedAt: Date;
}

/** One event instance (a single occurrence of a possibly recurring event). */
export interface InspectedEvent {
  /** The calendar object this instance belongs to. */
  objectId: string;
  uid: string;
  /** Resource name of the object inside the calendar (`…/{name}`). */
  name: string;
  summary: string | null;
  location: string | null;
  description: string | null;
  start: Date;
  end: Date;
  isAllDay: boolean;
  /** The instance comes from a recurring event. */
  isRecurring: boolean;
  /** The instance is a `RECURRENCE-ID` override. */
  isOverride: boolean;
  status: CalendarStatus | null;
  transparency: CalendarTransparency;
  /** The object's iCalendar text; only with `includeRaw`. */
  raw?: string;
}

/** Result of {@link ContentInspectionService.listEvents}. */
export interface InspectedEvents {
  events: InspectedEvent[];
  /** More objects or instances matched than the per-call limits allow. */
  truncated: boolean;
  /** Objects skipped because they are unparseable or recur too densely. */
  skipped: number;
}

/** An address book of a user, with the number of contacts it holds. */
export interface InspectedAddressbook {
  id: string;
  displayName: string;
  description: string | null;
  contactCount: number;
  updatedAt: Date;
}

/** A value of a typed vCard property, e.g. a phone number with its `TYPE`. */
export interface InspectedContactValue {
  value: string;
  types: string[];
}

/** One contact, reduced to what an admin wants to see. */
export interface InspectedContact {
  id: string;
  uid: string;
  name: string;
  displayName: string;
  organization: string | null;
  title: string | null;
  emails: InspectedContactValue[];
  phones: InspectedContactValue[];
  addresses: string[];
  birthday: string | null;
  notes: string | null;
  hasPhoto: boolean;
  updatedAt: Date;
  /** The object's vCard text; only with `includeRaw`. */
  raw?: string;
}

/** Options of {@link ContentInspectionService.listContacts}. */
export interface ListContactsOptions {
  limit: number;
  offset: number;
  /** Case-insensitive substring searched in name, e-mail, phone and organization. */
  q?: string;
  includeRaw?: boolean;
}

/** Properties the contact search looks at (all indexed by `indexVCard`). */
const SEARCHED_PROPERTIES = ['FN', 'N', 'EMAIL', 'TEL', 'ORG', 'NICKNAME'];

/** Escapes `%`, `_` and the escape character itself for `LIKE … ESCAPE '!'`. */
const escapeLike = (text: string) => text.replace(/[!%_]/g, (c) => `!${c}`);

const nullIfBlank = (text: string | null | undefined) =>
  text === null || text === undefined || text.trim() === '' ? null : text;

/** Joins the non-empty `;`-separated parts of a structured vCard value. */
const joinStructured = (value: string, separator = ', ') =>
  value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(separator);

/**
 * Read-only access to users' calendars and address books for the admin UI
 * (M14). Deliberately separate from the DAV code paths: it never checks or
 * writes ACLs, change logs or quota, and callers are responsible for the
 * authorization (the Admin API only exposes it to admins of the owner's
 * tenant, and only when the content view is enabled).
 */
export class ContentInspectionService {
  constructor(private readonly dataSource: DataSource) {}

  /** The calendars owned by `ownerPrincipalId`, ordered by name. */
  async listCalendars(
    tenantId: string,
    ownerPrincipalId: string,
  ): Promise<InspectedCalendar[]> {
    const calendars = await this.dataSource
      .getRepository(CalendarCollection)
      .find({
        where: { tenantId, ownerPrincipalId },
        order: { displayName: 'ASC', id: 'ASC' },
      });
    const counts = await this.countBy(
      CalendarObject,
      'calendarId',
      calendars.map((calendar) => calendar.id),
    );
    return calendars.map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      displayName: calendar.displayName,
      description: calendar.description,
      timezone: calendar.timezone,
      objectCount: counts.get(calendar.id) ?? 0,
      updatedAt: calendar.updatedAt,
    }));
  }

  /** A calendar of the tenant, or `null`. */
  async findCalendar(
    tenantId: string,
    ownerPrincipalId: string,
    calendarId: string,
  ): Promise<CalendarCollection | null> {
    return this.dataSource
      .getRepository(CalendarCollection)
      .findOneBy({ id: calendarId, tenantId, ownerPrincipalId });
  }

  /**
   * The event instances of `calendar` that overlap `[from, to)`, with
   * recurring events expanded. Only `VEVENT`s are listed.
   */
  async listEvents(
    calendar: CalendarCollection,
    from: Date,
    to: Date,
    includeRaw = false,
  ): Promise<InspectedEvents> {
    const objects = await this.dataSource
      .getRepository(CalendarObject)
      .createQueryBuilder('co')
      .where('co.calendarId = :calendarId', { calendarId: calendar.id })
      .andWhere("co.componentType = 'VEVENT'")
      .andWhere('co.dtstart < :rangeEnd', {
        rangeEnd: to.getTime() + FLOATING_TIME_OFFSET_BOUNDS_MS.latest,
      })
      .andWhere(
        '(co.recurrenceSpanEnd IS NULL OR co.recurrenceSpanEnd >= :rangeStart)',
        {
          rangeStart: from.getTime() + FLOATING_TIME_OFFSET_BOUNDS_MS.earliest,
        },
      )
      .orderBy('co.dtstart', 'ASC')
      .addOrderBy('co.id', 'ASC')
      .take(MAX_EVENT_OBJECTS + 1)
      .getMany();

    let truncated = objects.length > MAX_EVENT_OBJECTS;
    if (truncated) {
      objects.length = MAX_EVENT_OBJECTS;
    }
    const contents = objects.length
      ? await this.dataSource.getRepository(CalendarObjectContent).findBy({
          calendarObjectId: In(objects.map((object) => object.id)),
        })
      : [];
    const icsByObject = new Map(
      contents.map((content) => [content.calendarObjectId, content.icsData]),
    );

    const events: InspectedEvent[] = [];
    let skipped = 0;
    for (const object of objects) {
      const ics = icsByObject.get(object.id);
      if (ics === undefined) {
        skipped += 1;
        continue;
      }
      try {
        events.push(
          ...this.eventsOf(
            object,
            ics,
            calendar.timezone,
            from,
            to,
            includeRaw,
          ),
        );
      } catch {
        // An object that no longer parses, or whose recurrence rule is too
        // dense to walk (RecurrenceLimitError), must not hide the rest of
        // the calendar.
        skipped += 1;
      }
    }
    events.sort((a, b) => a.start.getTime() - b.start.getTime());
    if (events.length > MAX_EVENT_INSTANCES) {
      events.length = MAX_EVENT_INSTANCES;
      truncated = true;
    }
    return { events, truncated, skipped };
  }

  /** The address books owned by `ownerPrincipalId`, ordered by name. */
  async listAddressbooks(
    tenantId: string,
    ownerPrincipalId: string,
  ): Promise<InspectedAddressbook[]> {
    const books = await this.dataSource
      .getRepository(AddressbookCollection)
      .find({
        where: { tenantId, ownerPrincipalId },
        order: { displayName: 'ASC', id: 'ASC' },
      });
    const counts = await this.countBy(
      AddressObject,
      'addressbookId',
      books.map((book) => book.id),
    );
    return books.map((book) => ({
      id: book.id,
      displayName: book.displayName,
      description: book.description,
      contactCount: counts.get(book.id) ?? 0,
      updatedAt: book.updatedAt,
    }));
  }

  /** An address book of the tenant, or `null`. */
  async findAddressbook(
    tenantId: string,
    ownerPrincipalId: string,
    addressbookId: string,
  ): Promise<AddressbookCollection | null> {
    return this.dataSource
      .getRepository(AddressbookCollection)
      .findOneBy({ id: addressbookId, tenantId, ownerPrincipalId });
  }

  /** One page of the contacts of `addressbook`, ordered by resource name. */
  async listContacts(
    addressbook: AddressbookCollection,
    options: ListContactsOptions,
  ): Promise<{ contacts: InspectedContact[]; total: number }> {
    const query = this.dataSource
      .getRepository(AddressObject)
      .createQueryBuilder('ao')
      .where('ao.addressbookId = :addressbookId', {
        addressbookId: addressbook.id,
      });
    if (options.q) {
      query.andWhere((qb) => {
        const sub = qb
          .subQuery()
          .select('1')
          .from(AddressObjectIndex, 'idx')
          .where('idx.addressObjectId = ao.id')
          .andWhere('idx.propertyName IN (:...names)')
          .andWhere("LOWER(idx.propertyValue) LIKE :q ESCAPE '!'")
          .getQuery();
        return `EXISTS ${sub}`;
      });
      query.setParameters({
        names: SEARCHED_PROPERTIES,
        q: `%${escapeLike(options.q.toLowerCase())}%`,
      });
    }
    const total = await query.getCount();
    const objects = await query
      .orderBy('ao.name', 'ASC')
      .addOrderBy('ao.id', 'ASC')
      .skip(options.offset)
      .take(options.limit)
      .getMany();

    const contents = objects.length
      ? await this.dataSource.getRepository(AddressObjectContent).findBy({
          addressObjectId: In(objects.map((object) => object.id)),
        })
      : [];
    const vcardByObject = new Map(
      contents.map((content) => [content.addressObjectId, content.vcardData]),
    );
    return {
      total,
      contacts: objects.map((object) =>
        this.contactOf(
          object,
          vcardByObject.get(object.id) ?? null,
          options.includeRaw === true,
        ),
      ),
    };
  }

  /** `SELECT key, COUNT(*) … GROUP BY key` for the given owner ids. */
  private async countBy(
    entity: typeof CalendarObject | typeof AddressObject,
    column: 'calendarId' | 'addressbookId',
    ids: readonly string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.dataSource
      .getRepository(entity)
      .createQueryBuilder('e')
      .select(`e.${column}`, 'owner')
      .addSelect('COUNT(*)', 'total')
      .where(`e.${column} IN (:...ids)`, { ids })
      .groupBy(`e.${column}`)
      .getRawMany<{ owner: string; total: string | number }>();
    return new Map(rows.map((row) => [row.owner, Number(row.total)]));
  }

  private eventsOf(
    object: CalendarObject,
    ics: string,
    floatingTimeZone: string | null,
    from: Date,
    to: Date,
    includeRaw: boolean,
  ): InspectedEvent[] {
    const parsed: ParsedCalendarObject = parseCalendarObject(ics);
    if (parsed.task) {
      return [];
    }
    const occurrences = expandOccurrences(parsed, from, to, {
      floatingTimeZone,
    });
    if (occurrences.length === 0) {
      return [];
    }

    const root = new ICAL.Component(
      ICAL.parse(ics) as ConstructorParameters<typeof ICAL.Component>[0],
    );
    const rawVevents = root.getAllSubcomponents('vevent');
    const rawMaster =
      rawVevents.find((component) => !component.hasProperty('recurrence-id')) ??
      null;
    const rawOverrides = rawVevents.filter((component) =>
      component.hasProperty('recurrence-id'),
    );
    const resolution: TimeResolution = {
      zones: new ZoneRegistry(parsed.timezones),
      floatingTimeZone,
    };
    const overrideIndexByStart = new Map<number, number>();
    parsed.overrides.forEach((override, index) => {
      overrideIndexByStart.set(startMs(override, resolution), index);
    });
    const text = (
      component: ICAL.Component | null | undefined,
      name: string,
    ) => {
      const value = component?.getFirstPropertyValue(name);
      return typeof value === 'string' ? nullIfBlank(value) : null;
    };
    const isRecurring =
      parsed.master !== null &&
      (parsed.master.rrule !== null || parsed.master.rdate.length > 0);

    return occurrences.map((occurrence) => {
      const index = occurrence.isOverride
        ? overrideIndexByStart.get(occurrence.start.getTime())
        : undefined;
      const component =
        index === undefined ? rawMaster : (rawOverrides[index] ?? rawMaster);
      return {
        objectId: object.id,
        uid: object.uid,
        name: object.name,
        summary: text(component, 'summary'),
        location: text(component, 'location'),
        description: text(component, 'description'),
        start: occurrence.start,
        end: occurrence.end,
        isAllDay: occurrence.isAllDay,
        isRecurring: isRecurring || occurrence.isOverride,
        isOverride: occurrence.isOverride,
        status: occurrence.status,
        transparency: occurrence.transparency,
        ...(includeRaw ? { raw: ics } : {}),
      };
    });
  }

  private contactOf(
    object: AddressObject,
    vcard: string | null,
    includeRaw: boolean,
  ): InspectedContact {
    let parsed: ParsedVCard | null = null;
    if (vcard !== null) {
      try {
        parsed = parseVCard(vcard);
      } catch {
        // Show the contact by its resource name rather than failing the page.
      }
    }
    const values = (name: string): InspectedContactValue[] =>
      (parsed?.typed ?? [])
        .filter((property) => property.name === name)
        .map(({ value, types }) => ({ value, types }));
    const first = (list: string[] | undefined) => nullIfBlank(list?.[0]);
    const structuredName = first(parsed?.n);
    const displayName =
      first(parsed?.fn) ??
      (structuredName ? joinStructured(structuredName, ' ') : null) ??
      first(parsed?.org) ??
      parsed?.email[0] ??
      object.name;
    return {
      id: object.id,
      uid: object.uid,
      name: object.name,
      displayName,
      organization: nullIfBlank(
        parsed?.org[0] ? joinStructured(parsed.org[0]) : null,
      ),
      title: first(parsed?.title),
      emails: values('EMAIL'),
      phones: values('TEL'),
      addresses: (parsed?.adr ?? [])
        .map((address) => joinStructured(address))
        .filter((address) => address !== ''),
      birthday: first(parsed?.bday),
      notes: first(parsed?.note),
      hasPhoto: (parsed?.photo.length ?? 0) > 0,
      updatedAt: object.updatedAt,
      ...(includeRaw && vcard !== null ? { raw: vcard } : {}),
    };
  }
}
