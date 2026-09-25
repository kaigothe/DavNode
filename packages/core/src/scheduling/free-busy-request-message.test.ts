import { describe, expect, it } from 'vitest';
import {
  buildFreeBusyReplyForAttendee,
  FreeBusyRequestParseError,
  parseFreeBusyRequestMessage,
} from './free-busy-request-message.js';

/** RFC 6638 Appendix B.5's own worked example, as a fixture. */
const REQUEST = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Example Corp.//CalDAV Client//EN',
  'METHOD:REQUEST',
  'BEGIN:VFREEBUSY',
  'UID:4FD3AD926350',
  'DTSTAMP:20090602T190420Z',
  'DTSTART:20090602T000000Z',
  'DTEND:20090604T000000Z',
  'ORGANIZER;CN="Cyrus Daboo":mailto:cyrus@example.com',
  'ATTENDEE;CN="Wilfredo Sanchez Vega":mailto:wilfredo@example.com',
  'ATTENDEE;CN="Bernard Desruisseaux":mailto:bernard@example.net',
  'ATTENDEE;CN="Mike Douglass":mailto:mike@example.org',
  'END:VFREEBUSY',
  'END:VCALENDAR',
  '',
].join('\r\n');

describe('parseFreeBusyRequestMessage', () => {
  it("parses RFC 6638's own worked example", () => {
    const parsed = parseFreeBusyRequestMessage(REQUEST);

    expect(parsed).toEqual({
      uid: '4FD3AD926350',
      rangeStart: new Date('2009-06-02T00:00:00.000Z'),
      rangeEnd: new Date('2009-06-04T00:00:00.000Z'),
      organizerAddress: 'mailto:cyrus@example.com',
      attendeeAddresses: [
        'mailto:wilfredo@example.com',
        'mailto:bernard@example.net',
        'mailto:mike@example.org',
      ],
    });
  });

  it('rejects a body that is not iCalendar at all', () => {
    expect(() => parseFreeBusyRequestMessage('not icalendar')).toThrow(
      FreeBusyRequestParseError,
    );
  });

  it('rejects a METHOD other than REQUEST', () => {
    const body = REQUEST.replace('METHOD:REQUEST', 'METHOD:REPLY');

    expect(() => parseFreeBusyRequestMessage(body)).toThrow(
      FreeBusyRequestParseError,
    );
  });

  it('rejects a body with no VFREEBUSY component', () => {
    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'METHOD:REQUEST',
      'END:VCALENDAR',
      '',
    ].join('\r\n');

    expect(() => parseFreeBusyRequestMessage(body)).toThrow(
      FreeBusyRequestParseError,
    );
  });

  it('rejects a VFREEBUSY missing DTSTART/DTEND', () => {
    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'METHOD:REQUEST',
      'BEGIN:VFREEBUSY',
      'UID:x',
      'ORGANIZER:mailto:alice@example.com',
      'ATTENDEE:mailto:bob@example.com',
      'END:VFREEBUSY',
      'END:VCALENDAR',
      '',
    ].join('\r\n');

    expect(() => parseFreeBusyRequestMessage(body)).toThrow(
      FreeBusyRequestParseError,
    );
  });

  it('rejects a floating (non-UTC) DTSTART', () => {
    const body = REQUEST.replace(
      'DTSTART:20090602T000000Z',
      'DTSTART:20090602T000000',
    );

    expect(() => parseFreeBusyRequestMessage(body)).toThrow(
      FreeBusyRequestParseError,
    );
  });

  it('rejects DTEND at or before DTSTART', () => {
    const body = REQUEST.replace(
      'DTEND:20090604T000000Z',
      'DTEND:20090602T000000Z',
    );

    expect(() => parseFreeBusyRequestMessage(body)).toThrow(
      FreeBusyRequestParseError,
    );
  });

  it('rejects a VFREEBUSY with no ATTENDEE at all', () => {
    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'METHOD:REQUEST',
      'BEGIN:VFREEBUSY',
      'UID:x',
      'DTSTART:20090602T000000Z',
      'DTEND:20090604T000000Z',
      'ORGANIZER:mailto:alice@example.com',
      'END:VFREEBUSY',
      'END:VCALENDAR',
      '',
    ].join('\r\n');

    expect(() => parseFreeBusyRequestMessage(body)).toThrow(
      FreeBusyRequestParseError,
    );
  });
});

describe('buildFreeBusyReplyForAttendee', () => {
  it("builds a METHOD:REPLY VFREEBUSY naming exactly the one attendee, with the request's UID/range/organizer", () => {
    const request = parseFreeBusyRequestMessage(REQUEST);

    const reply = buildFreeBusyReplyForAttendee(
      request,
      'mailto:wilfredo@example.com',
      [
        {
          start: Date.parse('2009-06-02T11:00:00Z'),
          end: Date.parse('2009-06-02T12:00:00Z'),
          fbtype: 'BUSY',
        },
      ],
    );

    expect(reply).toContain('METHOD:REPLY');
    expect(reply).toContain('UID:4FD3AD926350');
    expect(reply).toContain('DTSTART:20090602T000000Z');
    expect(reply).toContain('DTEND:20090604T000000Z');
    expect(reply).toContain('ORGANIZER:mailto:cyrus@example.com');
    expect(reply).toContain('ATTENDEE:mailto:wilfredo@example.com');
    expect(reply).not.toContain('bernard@example.net');
    expect(reply).toContain('FREEBUSY:20090602T110000Z/20090602T120000Z');
  });

  it('marks a BUSY-TENTATIVE interval with FBTYPE', () => {
    const request = parseFreeBusyRequestMessage(REQUEST);

    const reply = buildFreeBusyReplyForAttendee(
      request,
      'mailto:wilfredo@example.com',
      [
        {
          start: Date.parse('2009-06-02T11:00:00Z'),
          end: Date.parse('2009-06-02T12:00:00Z'),
          fbtype: 'BUSY-TENTATIVE',
        },
      ],
    );

    expect(reply).toContain(
      'FREEBUSY;FBTYPE=BUSY-TENTATIVE:20090602T110000Z/20090602T120000Z',
    );
  });

  it('produces a VFREEBUSY with no FREEBUSY lines for an attendee with nothing busy', () => {
    const request = parseFreeBusyRequestMessage(REQUEST);

    const reply = buildFreeBusyReplyForAttendee(
      request,
      'mailto:wilfredo@example.com',
      [],
    );

    expect(reply).not.toMatch(/^FREEBUSY/m);
    expect(reply).toContain('BEGIN:VFREEBUSY');
    expect(reply).toContain('END:VFREEBUSY');
  });
});
