import { describe, expect, it } from 'vitest';
import { MAX_CALENDAR_NAME_LENGTH } from './calendar-name.js';
import { interpretMkcalendarProperties } from './mkcalendar-properties.js';
import {
  parseMkcalendarRequestBody,
  type MkcalendarSetProperty,
} from './mkcalendar-request.js';

const CALDAV = 'urn:ietf:params:xml:ns:caldav';

const US_EASTERN = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Example Corp.//CalDAV Client//EN',
  'VERSION:2.0',
  'BEGIN:VTIMEZONE',
  'TZID:US-Eastern',
  'BEGIN:STANDARD',
  'DTSTART:19671029T020000',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'END:STANDARD',
  'END:VTIMEZONE',
  'END:VCALENDAR',
  '',
].join('\r\n');

/** Parses `props` (the inside of `<D:prop>`) as a MKCALENDAR body and returns its properties. */
function set(props: string): MkcalendarSetProperty[] {
  return parseMkcalendarRequestBody(
    `<C:mkcalendar xmlns:D="DAV:" xmlns:C="${CALDAV}" xmlns:I="http://apple.com/ns/ical/"><D:set><D:prop>${props}</D:prop></D:set></C:mkcalendar>`,
  ).properties;
}

function accepted(props: string) {
  const result = interpretMkcalendarProperties(set(props));
  if (result.outcome !== 'accepted') {
    throw new Error(`expected accepted, got ${JSON.stringify(result)}`);
  }
  return result;
}

function rejected(props: string) {
  const result = interpretMkcalendarProperties(set(props));
  if (result.outcome !== 'rejected') {
    throw new Error(`expected rejected, got ${JSON.stringify(result)}`);
  }
  return result;
}

describe('interpretMkcalendarProperties', () => {
  it('yields the defaults for a request without properties', () => {
    const { initialization, results } = accepted('');

    expect(initialization).toEqual({
      displayName: null,
      description: null,
      timezone: null,
      supportedComponentSet: ['VEVENT'],
      deadProperties: [],
    });
    expect(results).toEqual([]);
  });

  it("takes displayname, description, timezone and component set from RFC 4791's example", () => {
    const { initialization, results } = accepted(`
      <D:displayname>Lisa's Events</D:displayname>
      <C:calendar-description xml:lang="en">Calendar restricted to events.</C:calendar-description>
      <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>
      <C:calendar-timezone><![CDATA[${US_EASTERN}]]></C:calendar-timezone>`);

    expect(initialization.displayName).toBe("Lisa's Events");
    expect(initialization.description).toBe('Calendar restricted to events.');
    expect(initialization.supportedComponentSet).toEqual(['VEVENT']);
    expect(initialization.timezone).toContain('TZID:US-Eastern');
    expect(results.map((r) => [r.name, r.status])).toEqual([
      ['displayname', 200],
      ['calendar-description', 200],
      ['supported-calendar-component-set', 200],
      ['calendar-timezone', 200],
    ]);
  });

  it('trims a displayname and treats a blank one as unset', () => {
    expect(
      accepted('<D:displayname>  Work  </D:displayname>').initialization
        .displayName,
    ).toBe('Work');
    expect(
      accepted('<D:displayname>   </D:displayname>').initialization.displayName,
    ).toBeNull();
    expect(accepted('<D:displayname/>').initialization.displayName).toBeNull();
  });

  it('reduces a requested component set to what is supported', () => {
    const set2 = (comps: string) =>
      accepted(
        `<C:supported-calendar-component-set>${comps}</C:supported-calendar-component-set>`,
      ).initialization.supportedComponentSet;

    expect(set2('<C:comp name="VEVENT"/><C:comp name="VTODO"/>')).toEqual([
      'VEVENT',
    ]);
    expect(set2('<C:comp name="VTODO"/>')).toEqual(['VEVENT']);
    expect(set2('<C:comp name="VTODO"/><C:comp name="VJOURNAL"/>')).toEqual([
      'VEVENT',
    ]);
    expect(set2('<C:comp name="vevent"/><C:comp name="VEVENT"/>')).toEqual([
      'VEVENT',
    ]);
    expect(set2('<C:comp name="VTIMEZONE"/>')).toEqual(['VEVENT']);
    expect(set2('')).toEqual(['VEVENT']);
  });

  it('reports the effective component set as the value of its result', () => {
    const { results } = accepted(
      `<C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>`,
    );

    expect(results).toEqual([
      {
        namespace: CALDAV,
        name: 'supported-calendar-component-set',
        value: `<C:comp name="VEVENT" xmlns:C="${CALDAV}"/>`,
        status: 200,
      },
    ]);
  });

  it('accepts a resourcetype that names the calendar, with or without DAV:collection', () => {
    expect(
      accepted('<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>')
        .results,
    ).toEqual([{ namespace: 'DAV:', name: 'resourcetype', status: 200 }]);
    expect(
      accepted('<D:resourcetype><C:calendar/></D:resourcetype>').outcome,
    ).toBe('accepted');
  });

  it('rejects a resourcetype that is not a calendar with 409 and fails the others with 424', () => {
    const { results } = rejected(`
      <D:displayname>x</D:displayname>
      <D:resourcetype><D:collection/></D:resourcetype>`);

    expect(results.map((r) => [r.name, r.status])).toEqual([
      ['displayname', 424],
      ['resourcetype', 409],
    ]);
  });

  it('stores properties in a namespace of the client’s own as dead properties', () => {
    const { initialization, results } = accepted(`
      <I:calendar-color>#FF0000FF</I:calendar-color>
      <I:calendar-order>3</I:calendar-order>`);

    expect(initialization.deadProperties).toEqual([
      {
        namespace: 'http://apple.com/ns/ical/',
        name: 'calendar-color',
        value: '#FF0000FF',
      },
      {
        namespace: 'http://apple.com/ns/ical/',
        name: 'calendar-order',
        value: '3',
      },
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  it.each([
    ['DAV:', 'creationdate'],
    ['DAV:', 'getlastmodified'],
    ['DAV:', 'getetag'],
    ['DAV:', 'owner'],
    ['DAV:', 'acl'],
    ['DAV:', 'current-user-privilege-set'],
    ['DAV:', 'made-up'],
    [CALDAV, 'supported-calendar-data'],
    [CALDAV, 'calendar-home-set'],
    [CALDAV, 'made-up'],
  ])(
    'refuses the server-defined property {%s}%s with 403',
    (namespace, name) => {
      const { results } = rejected(`
      <D:displayname>Kept out</D:displayname>
      <x:${name} xmlns:x="${namespace}">v</x:${name}>`);

      expect(results.map((r) => [r.name, r.status])).toEqual([
        ['displayname', 424],
        [name, 403],
      ]);
    },
  );

  it('fails every instruction of the request when one is rejected, in document order', () => {
    const { results } = rejected(`
      <I:calendar-color>#000000FF</I:calendar-color>
      <D:creationdate>2024-01-01T00:00:00Z</D:creationdate>
      <C:calendar-description>d</C:calendar-description>`);

    expect(results.map((r) => [r.name, r.status])).toEqual([
      ['calendar-color', 424],
      ['creationdate', 403],
      ['calendar-description', 424],
    ]);
  });

  it('lets a later instruction override an earlier one for the same property', () => {
    const { initialization, results } = accepted(`
      <D:displayname>first</D:displayname>
      <I:calendar-color>#111111FF</I:calendar-color>
      <D:displayname>second</D:displayname>
      <I:calendar-color>#222222FF</I:calendar-color>`);

    expect(initialization.displayName).toBe('second');
    expect(initialization.deadProperties).toEqual([
      {
        namespace: 'http://apple.com/ns/ical/',
        name: 'calendar-color',
        value: '#222222FF',
      },
    ]);
    expect(results.map((r) => r.name)).toEqual([
      'displayname',
      'calendar-color',
    ]);
  });

  it('rejects a displayname or a property name longer than the database holds with 409', () => {
    const tooLong = 'x'.repeat(MAX_CALENDAR_NAME_LENGTH + 1);

    expect(
      rejected(`<D:displayname>${tooLong}</D:displayname>`).results[0]?.status,
    ).toBe(409);
    expect(
      rejected(`<x:${tooLong} xmlns:x="urn:example">v</x:${tooLong}>`)
        .results[0]?.status,
    ).toBe(409);
    expect(
      accepted(
        `<D:displayname>${'x'.repeat(MAX_CALENDAR_NAME_LENGTH)}</D:displayname>`,
      ).outcome,
    ).toBe('accepted');
  });

  it.each([
    ['empty', ''],
    ['not iCalendar', 'Europe/Berlin'],
    [
      'a VEVENT instead of a VTIMEZONE',
      'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR',
    ],
  ])(
    'reports a calendar-timezone that is %s as invalid-timezone',
    (_label, text) => {
      const result = interpretMkcalendarProperties(
        set(`<C:calendar-timezone><![CDATA[${text}]]></C:calendar-timezone>`),
      );

      expect(result.outcome).toBe('invalid-timezone');
    },
  );

  it('reports an invalid timezone before rejecting other properties', () => {
    const result = interpretMkcalendarProperties(
      set(`
        <D:creationdate>x</D:creationdate>
        <C:calendar-timezone>nonsense</C:calendar-timezone>`),
    );

    expect(result.outcome).toBe('invalid-timezone');
  });
});
