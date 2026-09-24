import type { DataSource, EntityManager } from 'typeorm';
import { createOwnerAllAce } from '../acl/create-owner-ace.js';
import { CalendarObjectAce } from '../entities/calendar-object-ace.entity.js';
import { CalendarObjectContent } from '../entities/calendar-object-content.entity.js';
import { CalendarObjectLock } from '../entities/calendar-object-lock.entity.js';
import { CalendarObjectProperty } from '../entities/calendar-object-property.entity.js';
import { CalendarObject } from '../entities/calendar-object.entity.js';
import { isUniqueConstraintViolationError } from '../services/unique-constraint.util.js';
import { CalendarChangeService } from './calendar-change.service.js';
import type { ParsedCalendarObject } from './icalendar-parser.js';
import {
  computeTimeRangeIndex,
  indexCalendarObject,
} from './index-calendar-object.js';

/**
 * Thrown by {@link saveCalendarObject} when the object's `UID` would not
 * be unique in its calendar — RFC 4791 §5.3.2.1's
 * `CALDAV:no-uid-conflict`: a `UID` already used by another resource, or
 * a different `UID` for an existing resource ("MUST NOT ... overwrite an
 * existing calendar object resource with one that has a different UID").
 */
export class CalendarUidConflictError extends Error {
  /** @param conflictingName - The URL name of the resource that makes use of the `UID`. */
  constructor(readonly conflictingName: string) {
    super(
      `The UID conflicts with the calendar object "${conflictingName}" in the same calendar.`,
    );
    this.name = 'CalendarUidConflictError';
  }
}

/**
 * Thrown when the object a write was based on is no longer as the caller
 * saw it: a guarded overwrite whose ETag has moved on, an object deleted
 * in the meantime, or a name another request created first. HTTP maps it
 * to `412 Precondition Failed`.
 */
export class CalendarObjectChangedError extends Error {
  /** @param name - The URL name of the object the write targeted. */
  constructor(readonly name: string) {
    super(`The calendar object "${name}" changed while it was being written.`);
    this.name = 'CalendarObjectChangedError';
  }
}

/** What {@link saveCalendarObject} needs to store one calendar object resource. */
export interface SaveCalendarObjectInput {
  /** The tenant of the calendar. */
  tenantId: string;
  /** The calendar the object is stored in. */
  calendarId: string;
  /** The object's URL name within the calendar. */
  name: string;
  /** The principal that becomes the owner of a *new* object (and gets its default ACE). */
  ownerPrincipalId: string;
  /** The submitted iCalendar text, stored verbatim. */
  ics: string;
  /** `ics`, already parsed and validated. */
  parsed: ParsedCalendarObject;
  /** The strong ETag of `ics`. */
  etag: string;
  /** The object currently at `name`, or `null` if the request creates it. */
  existing: CalendarObject | null;
  /**
   * With `existing`: overwrite only while its ETag is still this value
   * (the request's `If-Match`), checked atomically with the write so two
   * concurrent conditional requests can't both win. Without it the
   * overwrite is unconditional.
   */
  expectedEtag?: string;
}

/** The outcome of {@link saveCalendarObject}. */
export interface SavedCalendarObject {
  /** `true` if the object was created, `false` if an existing one was overwritten. */
  created: boolean;
  /** The stored object. */
  object: CalendarObject;
}

const changeService = new CalendarChangeService();

/**
 * The write itself, inside the caller's transaction.
 *
 * A new object is inserted with its time-range index columns already
 * computed (`dtstart` is not nullable, so the row can't exist without
 * them); an overwrite re-derives all of them with `indexCalendarObject`,
 * so nothing of the previous version stays behind. Either way the object,
 * its content, its index, its default-owner ACE (new objects) and the
 * calendar's change-log entry commit or roll back together.
 *
 * **The change-log entry is written first**, because recording it updates
 * the calendar row (`syncSeq`) and so takes that row's exclusive lock —
 * which makes every write to one calendar wait for the one before it,
 * and always before it touches an object row. Left for the end, the
 * update would have to *upgrade* the shared lock that inserting an
 * object row already holds on its calendar (the foreign key check), and
 * two concurrent writes deadlock on exactly that upgrade on MySQL. It
 * also numbers the changes in the order they take effect.
 */
async function write(
  manager: EntityManager,
  input: SaveCalendarObjectInput,
): Promise<SavedCalendarObject> {
  const { parsed, existing } = input;
  const objects = manager.getRepository(CalendarObject);

  await changeService.recordChange(
    manager,
    input.calendarId,
    input.name,
    existing ? 'modified' : 'added',
  );

  if (existing && existing.uid !== parsed.uid) {
    throw new CalendarUidConflictError(existing.name);
  }
  const clash = await objects.findOneBy({
    calendarId: input.calendarId,
    uid: parsed.uid,
  });
  if (clash && clash.id !== existing?.id) {
    throw clash.name === input.name
      ? new CalendarObjectChangedError(input.name)
      : new CalendarUidConflictError(clash.name);
  }

  if (existing) {
    const result = await objects.update(
      input.expectedEtag === undefined
        ? { id: existing.id }
        : { id: existing.id, etag: input.expectedEtag },
      { etag: input.etag, componentType: parsed.componentType },
    );
    if (!result.affected) {
      throw new CalendarObjectChangedError(input.name);
    }
    await manager
      .getRepository(CalendarObjectContent)
      .update({ calendarObjectId: existing.id }, { icsData: input.ics });
    await indexCalendarObject(manager, existing.id, parsed);
    return {
      created: false,
      object: await objects.findOneByOrFail({ id: existing.id }),
    };
  }

  const created = await objects.save(
    objects.create({
      tenantId: input.tenantId,
      calendarId: input.calendarId,
      name: input.name,
      uid: parsed.uid,
      etag: input.etag,
      componentType: parsed.componentType,
      ownerPrincipalId: input.ownerPrincipalId,
      ...computeTimeRangeIndex(parsed),
    }),
  );
  const contents = manager.getRepository(CalendarObjectContent);
  await contents.save(
    contents.create({ calendarObjectId: created.id, icsData: input.ics }),
  );
  await createOwnerAllAce(
    manager,
    'calendar-object',
    created.id,
    input.ownerPrincipalId,
  );
  return { created: true, object: created };
}

/**
 * Stores a calendar object resource (CalDAV `PUT`): creates it, or
 * overwrites the `existing` one, in a single transaction — the row, its
 * `CalendarObjectContent`, its time-range index columns, the owner ACE of
 * a new object and the calendar's change-log entry (`added`/`modified`,
 * `syncSeq` bumped).
 *
 * The `UID` must be unique in the calendar (`CALDAV:no-uid-conflict`,
 * RFC 4791 §5.3.2.1): it may not belong to another object, and an
 * existing object keeps its `UID`. Two requests racing for the same `UID`
 * or URL are settled by the unique indexes, which surface as the same
 * errors as the checks above — never as a raw constraint failure.
 *
 * @throws {@link CalendarUidConflictError} If the `UID` isn't unique.
 * @throws {@link CalendarObjectChangedError} If the object changed under
 * a guarded overwrite, or its URL was taken by a concurrent create.
 */
export async function saveCalendarObject(
  dataSource: DataSource,
  input: SaveCalendarObjectInput,
): Promise<SavedCalendarObject> {
  try {
    return await dataSource.transaction((manager) => write(manager, input));
  } catch (error) {
    if (!isUniqueConstraintViolationError(error)) {
      throw error;
    }
    const clash = await dataSource.getRepository(CalendarObject).findOneBy({
      calendarId: input.calendarId,
      uid: input.parsed.uid,
    });
    if (clash && clash.id !== input.existing?.id && clash.name !== input.name) {
      throw new CalendarUidConflictError(clash.name);
    }
    throw new CalendarObjectChangedError(input.name);
  }
}

/** Rolls a delete back when it finds nothing to delete; never leaves {@link deleteCalendarObject}. */
class NothingToDelete extends Error {}

/** What {@link deleteCalendarObject} needs. */
export interface DeleteCalendarObjectInput {
  /** The calendar the object lives in. */
  calendarId: string;
  /** The object to delete. */
  object: CalendarObject;
  /** If set, delete only while the object's ETag is still this value (the request's `If-Match`). */
  expectedEtag?: string;
}

/**
 * Deletes a calendar object resource (CalDAV `DELETE`) in one transaction:
 * its dead properties, ACEs and locks (none of which cascade at the
 * database level), then the `CalendarObject` row itself — which takes its
 * `CalendarObjectContent` and, as the time-range index lives in its own
 * columns, its index with it — and records the `deleted` change. As in
 * {@link saveCalendarObject}, the change is recorded first, so the
 * calendar row is locked before any object row (see there for why).
 *
 * @returns `false`, with nothing changed, if the object is already gone
 * or (with `expectedEtag`) has a different ETag now; `true` otherwise.
 */
export async function deleteCalendarObject(
  dataSource: DataSource,
  input: DeleteCalendarObjectInput,
): Promise<boolean> {
  const { object } = input;
  try {
    await dataSource.transaction(async (manager) => {
      await changeService.recordChange(
        manager,
        input.calendarId,
        object.name,
        'deleted',
      );
      const calendarObjectId = object.id;
      await manager
        .getRepository(CalendarObjectProperty)
        .delete({ calendarObjectId });
      await manager
        .getRepository(CalendarObjectAce)
        .delete({ calendarObjectId });
      await manager
        .getRepository(CalendarObjectLock)
        .delete({ calendarObjectId });
      const result = await manager
        .getRepository(CalendarObject)
        .delete(
          input.expectedEtag === undefined
            ? { id: object.id }
            : { id: object.id, etag: input.expectedEtag },
        );
      if (!result.affected) {
        throw new NothingToDelete();
      }
    });
    return true;
  } catch (error) {
    if (error instanceof NothingToDelete) {
      return false;
    }
    throw error;
  }
}
