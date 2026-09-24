import { create } from 'xmlbuilder2';
import { describe, expect, it } from 'vitest';
import {
  InvalidExpandRangeError,
  parseCalendarReportPropertySelection,
  parseUtcDateTime,
} from './calendar-report-request.js';

describe('parseUtcDateTime', () => {
  it('parses a valid "date with UTC time" value', () => {
    const date = parseUtcDateTime('20260924T100000Z');
    expect(date?.toISOString()).toBe('2026-09-24T10:00:00.000Z');
  });

  it('trims surrounding whitespace', () => {
    expect(parseUtcDateTime('  20260924T100000Z  ')?.toISOString()).toBe(
      '2026-09-24T10:00:00.000Z',
    );
  });

  it.each([
    'not-a-date',
    '20260924',
    '20260924T100000',
    '2026-09-24T10:00:00Z',
    '20260924T1000Z',
    '',
  ])('rejects %j', (text) => {
    expect(parseUtcDateTime(text)).toBeNull();
  });

  it('rejects a syntactically plausible but impossible date rather than rolling it over', () => {
    expect(parseUtcDateTime('20060231T000000Z')).toBeNull();
    expect(parseUtcDateTime('20260229T000000Z')).toBeNull(); // 2026 is not a leap year
    expect(parseUtcDateTime('20260931T000000Z')).toBeNull(); // September has 30 days
  });

  it('accepts a real leap day', () => {
    expect(parseUtcDateTime('20240229T000000Z')?.getUTCDate()).toBe(29);
  });
});

const CALDAV = 'urn:ietf:params:xml:ns:caldav';

function parse(inner: string) {
  const xml = `<C:calendar-multiget xmlns:D="DAV:" xmlns:C="${CALDAV}">${inner}</C:calendar-multiget>`;
  return parseCalendarReportPropertySelection(create(xml).root());
}

describe('parseCalendarReportPropertySelection', () => {
  it('defaults to allprop when the body names no property selection', () => {
    expect(parse('<D:href>/x</D:href>')).toEqual({ kind: 'allprop' });
  });

  it('parses DAV:allprop and DAV:propname', () => {
    expect(parse('<D:allprop/>')).toEqual({ kind: 'allprop' });
    expect(parse('<D:propname/>')).toEqual({ kind: 'propname' });
  });

  it('lists the requested properties in order, with calendar-data at its position', () => {
    const selection = parse(
      '<D:prop><D:getetag/><C:calendar-data/><D:getcontenttype/></D:prop>',
    );

    expect(selection).toEqual({
      kind: 'prop',
      properties: [
        { namespace: 'DAV:', name: 'getetag' },
        { namespace: CALDAV, name: 'calendar-data' },
        { namespace: 'DAV:', name: 'getcontenttype' },
      ],
      calendarData: {
        contentType: undefined,
        version: undefined,
        expand: undefined,
      },
    });
  });

  it('reads the content-type and version attributes of calendar-data', () => {
    const selection = parse(
      `<D:prop><C:calendar-data content-type="text/calendar" version="2.0"/></D:prop>`,
    );

    expect(selection).toMatchObject({
      calendarData: { contentType: 'text/calendar', version: '2.0' },
    });
  });

  it('reads a <C:expand> element', () => {
    const selection = parse(
      `<D:prop><C:calendar-data><C:expand start="20260101T000000Z" end="20260201T000000Z"/></C:calendar-data></D:prop>`,
    );

    expect(selection).toMatchObject({
      calendarData: {
        expand: {
          start: new Date('2026-01-01T00:00:00Z'),
          end: new Date('2026-02-01T00:00:00Z'),
        },
      },
    });
  });

  it('has no calendarData when calendar-data was not requested', () => {
    expect(parse('<D:prop><D:getetag/></D:prop>')).toMatchObject({
      kind: 'prop',
      calendarData: null,
    });
  });

  it('ignores an unsupported comp/limit-recurrence-set/limit-freebusy-set child rather than erroring', () => {
    const selection = parse(
      `<D:prop><C:calendar-data><C:comp name="VEVENT"/><C:limit-recurrence-set start="20260101T000000Z" end="20260201T000000Z"/></C:calendar-data></D:prop>`,
    );

    expect(selection).toMatchObject({ calendarData: { expand: undefined } });
  });

  it.each([
    ['missing end', '<C:expand start="20260101T000000Z"/>'],
    ['missing start', '<C:expand end="20260101T000000Z"/>'],
    [
      'end not after start',
      '<C:expand start="20260101T000000Z" end="20260101T000000Z"/>',
    ],
    [
      'end before start',
      '<C:expand start="20260201T000000Z" end="20260101T000000Z"/>',
    ],
    [
      'unparsable start',
      '<C:expand start="not-a-date" end="20260201T000000Z"/>',
    ],
  ])('rejects an <C:expand> with %s', (_label, expand) => {
    expect(() =>
      parse(`<D:prop><C:calendar-data>${expand}</C:calendar-data></D:prop>`),
    ).toThrow(InvalidExpandRangeError);
  });
});
