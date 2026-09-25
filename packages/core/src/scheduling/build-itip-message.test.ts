import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import {
  buildCancelMessage,
  buildReplyMessage,
  buildRequestMessage,
} from './build-itip-message.js';

const ORGANIZER = 'mailto:alice@example.com';
const BOB = 'mailto:bob@example.com';
const CAROL = 'mailto:carol@example.com';

/** A single-event scheduling object resource: an organizer and two attendees, sequence 2. */
const SINGLE_EVENT = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//DavNode//Test//EN',
  'BEGIN:VEVENT',
  'UID:event-1',
  'DTSTAMP:20260101T000000Z',
  'DTSTART:20260924T100000Z',
  'DTEND:20260924T110000Z',
  'SUMMARY:Planning',
  'SEQUENCE:2',
  `ORGANIZER:${ORGANIZER}`,
  `ATTENDEE;PARTSTAT=ACCEPTED:${BOB}`,
  `ATTENDEE;PARTSTAT=NEEDS-ACTION:${CAROL}`,
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

/** A recurring series: a master and one RECURRENCE-ID override, both scheduled. */
const SERIES_WITH_OVERRIDE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//DavNode//Test//EN',
  'BEGIN:VEVENT',
  'UID:series-1',
  'DTSTAMP:20260101T000000Z',
  'DTSTART:20260105T090000Z',
  'DTEND:20260105T100000Z',
  'RRULE:FREQ=WEEKLY;COUNT=4',
  'SUMMARY:Standup',
  `ORGANIZER:${ORGANIZER}`,
  `ATTENDEE;PARTSTAT=ACCEPTED:${BOB}`,
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:series-1',
  'DTSTAMP:20260101T000000Z',
  'RECURRENCE-ID:20260112T090000Z',
  'DTSTART:20260112T140000Z',
  'DTEND:20260112T150000Z',
  'SUMMARY:Standup (moved)',
  `ORGANIZER:${ORGANIZER}`,
  `ATTENDEE;PARTSTAT=ACCEPTED:${BOB}`,
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

/** Parses `text` with the raw ical.js engine — proof of syntactic validity independent of DavNode's own (stricter, METHOD-rejecting) `parseCalendarObject`. */
function reparse(text: string): ICAL.Component {
  return new ICAL.Component(
    ICAL.parse(text) as ConstructorParameters<typeof ICAL.Component>[0],
  );
}

describe('buildRequestMessage', () => {
  it('adds METHOD:REQUEST while keeping every original component unchanged', () => {
    const message = buildRequestMessage(SERIES_WITH_OVERRIDE);

    const root = reparse(message);
    expect(root.getFirstPropertyValue('method')).toBe('REQUEST');
    const vevents = root.getAllSubcomponents('vevent');
    expect(vevents).toHaveLength(2);
    expect(vevents[0]?.getFirstPropertyValue('rrule')).toBeTruthy();
    expect(vevents[1]?.getFirstPropertyValue('recurrence-id')).toBeTruthy();
    expect(message).toContain('Standup (moved)');
    expect(message).toContain(`ATTENDEE;PARTSTAT=ACCEPTED:${BOB}`);
  });

  it('keeps the original SEQUENCE value (increment happens before this is called)', () => {
    const message = buildRequestMessage(SINGLE_EVENT);

    const root = reparse(message);
    expect(
      root.getFirstSubcomponent('vevent')?.getFirstPropertyValue('sequence'),
    ).toBe(2);
  });
});

describe('buildReplyMessage', () => {
  it('contains exactly one ATTENDEE line — the replying attendee, not the full list', () => {
    const message = buildReplyMessage(SINGLE_EVENT, BOB);

    const root = reparse(message);
    expect(root.getFirstPropertyValue('method')).toBe('REPLY');
    const vevent = root.getFirstSubcomponent('vevent');
    const attendees = vevent?.getAllProperties('attendee') ?? [];
    expect(attendees).toHaveLength(1);
    expect(attendees[0]?.getFirstValue()).toBe(BOB);
    expect(attendees[0]?.getParameter('partstat')).toBe('ACCEPTED');
  });

  it('carries UID, ORGANIZER, SEQUENCE and a fresh DTSTAMP, but no event details', () => {
    const message = buildReplyMessage(SINGLE_EVENT, CAROL);

    const root = reparse(message);
    const vevent = root.getFirstSubcomponent('vevent');
    expect(vevent?.getFirstPropertyValue('uid')).toBe('event-1');
    expect(vevent?.getFirstPropertyValue('organizer')).toBe(ORGANIZER);
    expect(vevent?.getFirstPropertyValue('sequence')).toBe(2);
    expect(vevent?.hasProperty('dtstamp')).toBe(true);
    expect(vevent?.hasProperty('summary')).toBe(false);
    expect(vevent?.hasProperty('dtstart')).toBe(false);
    expect(vevent?.hasProperty('recurrence-id')).toBe(false);
  });

  it('throws for an attendee address not on the event', () => {
    expect(() =>
      buildReplyMessage(SINGLE_EVENT, 'mailto:stranger@example.com'),
    ).toThrow();
  });

  it('produces syntactically valid, re-readable iCalendar', () => {
    expect(() => reparse(buildReplyMessage(SINGLE_EVENT, BOB))).not.toThrow();
  });
});

describe('buildCancelMessage', () => {
  it('sets STATUS:CANCELLED on the whole event and keeps every attendee, without a second argument', () => {
    const message = buildCancelMessage(SINGLE_EVENT);

    const root = reparse(message);
    expect(root.getFirstPropertyValue('method')).toBe('CANCEL');
    const vevent = root.getFirstSubcomponent('vevent');
    expect(vevent?.getFirstPropertyValue('status')).toBe('CANCELLED');
    expect(vevent?.getAllProperties('attendee')).toHaveLength(2);
  });

  it('restricts ATTENDEE to the given addresses and omits STATUS when a second argument is given', () => {
    const message = buildCancelMessage(SINGLE_EVENT, [CAROL]);

    const root = reparse(message);
    const vevent = root.getFirstSubcomponent('vevent');
    expect(vevent?.hasProperty('status')).toBe(false);
    const attendees = vevent?.getAllProperties('attendee') ?? [];
    expect(attendees).toHaveLength(1);
    expect(attendees[0]?.getFirstValue()).toBe(CAROL);
  });

  it('increments SEQUENCE and refreshes DTSTAMP', () => {
    const message = buildCancelMessage(SINGLE_EVENT);

    const root = reparse(message);
    const vevent = root.getFirstSubcomponent('vevent');
    expect(vevent?.getFirstPropertyValue('sequence')).toBe(3);
    expect(vevent?.hasProperty('dtstamp')).toBe(true);
  });

  it('applies to every component of a recurring series (master and overrides)', () => {
    const message = buildCancelMessage(SERIES_WITH_OVERRIDE);

    const root = reparse(message);
    const vevents = root.getAllSubcomponents('vevent');
    expect(vevents).toHaveLength(2);
    for (const vevent of vevents) {
      expect(vevent.getFirstPropertyValue('status')).toBe('CANCELLED');
    }
  });

  it('produces syntactically valid, re-readable iCalendar', () => {
    expect(() => reparse(buildCancelMessage(SINGLE_EVENT))).not.toThrow();
    expect(() =>
      reparse(buildCancelMessage(SINGLE_EVENT, [BOB])),
    ).not.toThrow();
  });
});
