import { describe, expect, it } from 'vitest';
import { parseCalendarMultigetRequestBody } from './calendar-multiget-request.js';

const CALDAV = 'urn:ietf:params:xml:ns:caldav';

function body(inner: string): string {
  return `<C:calendar-multiget xmlns:D="DAV:" xmlns:C="${CALDAV}">${inner}</C:calendar-multiget>`;
}

describe('parseCalendarMultigetRequestBody', () => {
  it('reads the hrefs in order, trimmed', () => {
    const parsed = parseCalendarMultigetRequestBody(
      body('<D:href> /a.ics </D:href><D:href>/b.ics</D:href>'),
    );

    expect(parsed.hrefs).toEqual(['/a.ics', '/b.ics']);
  });

  it('reads the property selection, including calendar-data', () => {
    const parsed = parseCalendarMultigetRequestBody(
      body(
        '<D:prop><D:getetag/><C:calendar-data/></D:prop><D:href>/a.ics</D:href>',
      ),
    );

    expect(parsed.selection.kind).toBe('prop');
  });

  it('rejects a body with no DAV:href', () => {
    expect(() => parseCalendarMultigetRequestBody(body(''))).toThrow();
  });

  it('rejects a wrong root element', () => {
    expect(() =>
      parseCalendarMultigetRequestBody(
        `<C:calendar-query xmlns:D="DAV:" xmlns:C="${CALDAV}"/>`,
      ),
    ).toThrow();
  });

  it('rejects malformed XML', () => {
    expect(() =>
      parseCalendarMultigetRequestBody('<C:calendar-multiget'),
    ).toThrow();
  });
});
