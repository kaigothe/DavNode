import { describe, expect, it } from 'vitest';
import { parseFreeBusyQueryRequestBody } from './free-busy-query-request.js';

const CALDAV = 'urn:ietf:params:xml:ns:caldav';

describe('parseFreeBusyQueryRequestBody', () => {
  it("parses RFC 4791's example", () => {
    const parsed = parseFreeBusyQueryRequestBody(
      `<C:free-busy-query xmlns:C="${CALDAV}"><C:time-range start="20060104T140000Z" end="20060105T220000Z"/></C:free-busy-query>`,
    );

    expect(parsed).toEqual({
      start: new Date('2006-01-04T14:00:00Z'),
      end: new Date('2006-01-05T22:00:00Z'),
    });
  });

  it('accepts an open-ended range (only start or only end)', () => {
    expect(
      parseFreeBusyQueryRequestBody(
        `<C:free-busy-query xmlns:C="${CALDAV}"><C:time-range start="20060104T140000Z"/></C:free-busy-query>`,
      ),
    ).toEqual({ start: new Date('2006-01-04T14:00:00Z'), end: null });
  });

  it('rejects a body with no time-range', () => {
    expect(() =>
      parseFreeBusyQueryRequestBody(`<C:free-busy-query xmlns:C="${CALDAV}"/>`),
    ).toThrow();
  });

  it('rejects a wrong root element and malformed XML', () => {
    expect(() =>
      parseFreeBusyQueryRequestBody(
        `<C:calendar-query xmlns:C="${CALDAV}"><C:time-range start="20060104T140000Z"/></C:calendar-query>`,
      ),
    ).toThrow();
    expect(() => parseFreeBusyQueryRequestBody('<C:free-busy-query')).toThrow();
  });
});
