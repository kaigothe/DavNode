import { create } from 'xmlbuilder2';
import { describe, expect, it } from 'vitest';
import {
  classifyCalendarFilter,
  parseCalendarQueryRequestBody,
  parseFilterElement,
  parseTimeRangeElement,
} from './calendar-query-request.js';

const CALDAV = 'urn:ietf:params:xml:ns:caldav';

function filterOf(inner: string) {
  const xml = `<C:filter xmlns:D="DAV:" xmlns:C="${CALDAV}">${inner}</C:filter>`;
  return classifyCalendarFilter(parseFilterElement(create(xml).root()));
}

describe('classifyCalendarFilter', () => {
  it('an empty VCALENDAR comp-filter matches everything', () => {
    expect(filterOf('<C:comp-filter name="VCALENDAR"/>')).toEqual({
      filter: { kind: 'match-all' },
      unsupported: { names: [], paramFilters: [], collations: [] },
    });
  });

  it('a VCALENDAR comp-filter with an empty VEVENT child matches every VEVENT', () => {
    const { filter, unsupported } = filterOf(
      '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/></C:comp-filter>',
    );

    expect(filter).toEqual({
      kind: 'vevent',
      timeRange: null,
      propFilters: [],
    });
    expect(unsupported).toEqual({
      names: [],
      paramFilters: [],
      collations: [],
    });
  });

  it('matches the component name case-insensitively', () => {
    const { filter } = filterOf(
      '<C:comp-filter name="vcalendar"><C:comp-filter name="vevent"/></C:comp-filter>',
    );

    expect(filter.kind).toBe('vevent');
  });

  it('carries a VEVENT-level time-range through', () => {
    const { filter } = filterOf(
      '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:time-range start="20260101T000000Z" end="20260201T000000Z"/></C:comp-filter></C:comp-filter>',
    );

    expect(filter).toEqual({
      kind: 'vevent',
      timeRange: {
        start: new Date('2026-01-01T00:00:00Z'),
        end: new Date('2026-02-01T00:00:00Z'),
      },
      propFilters: [],
    });
  });

  it('a comp-filter naming a type this server never stores, without is-not-defined, matches nothing', () => {
    for (const name of ['VTODO', 'VJOURNAL', 'VFREEBUSY']) {
      const { filter, unsupported } = filterOf(
        `<C:comp-filter name="VCALENDAR"><C:comp-filter name="${name}"/></C:comp-filter>`,
      );
      expect(filter).toEqual({ kind: 'match-none' });
      expect(unsupported.names).toEqual([]);
    }
  });

  it('a comp-filter naming a type this server never stores, with is-not-defined, matches everything', () => {
    const { filter, unsupported } = filterOf(
      '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VTODO"><C:is-not-defined/></C:comp-filter></C:comp-filter>',
    );

    expect(filter).toEqual({ kind: 'match-all' });
    expect(unsupported.names).toEqual([]);
  });

  it('a VEVENT comp-filter with is-not-defined matches nothing (every object has a VEVENT)', () => {
    const { filter } = filterOf(
      '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:is-not-defined/></C:comp-filter></C:comp-filter>',
    );

    expect(filter).toEqual({ kind: 'match-none' });
  });

  it('a root comp-filter with is-not-defined matches nothing (every object is a VCALENDAR)', () => {
    const { filter } = filterOf(
      '<C:comp-filter name="VCALENDAR"><C:is-not-defined/></C:comp-filter>',
    );

    expect(filter).toEqual({ kind: 'match-none' });
  });

  it.each(['VEVENT', 'VTODO'])(
    'rejects a root comp-filter not named VCALENDAR (%s)',
    (name) => {
      const { filter, unsupported } = filterOf(
        `<C:comp-filter name="${name}"/>`,
      );

      expect(filter).toEqual({ kind: 'match-all' });
      expect(unsupported.names).toEqual([`comp-filter[${name}]`]);
    },
  );

  it('rejects a VCALENDAR-level time-range or prop-filter', () => {
    const withTimeRange = filterOf(
      '<C:comp-filter name="VCALENDAR"><C:time-range start="20260101T000000Z" end="20260201T000000Z"/></C:comp-filter>',
    );
    expect(withTimeRange.unsupported.names).toContain('comp-filter[VCALENDAR]');

    const withPropFilter = filterOf(
      '<C:comp-filter name="VCALENDAR"><C:prop-filter name="SUMMARY"/></C:comp-filter>',
    );
    expect(withPropFilter.unsupported.names).toContain(
      'comp-filter[VCALENDAR]',
    );
  });

  it('rejects more than one component named directly under VCALENDAR', () => {
    const { filter, unsupported } = filterOf(
      '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/><C:comp-filter name="VTODO"/></C:comp-filter>',
    );

    expect(filter).toEqual({ kind: 'match-all' });
    expect(unsupported.names).toEqual(['comp-filter[VEVENT,VTODO]']);
  });

  it('rejects a component nested inside VEVENT (e.g. VALARM)', () => {
    const { unsupported } = filterOf(
      '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:comp-filter name="VALARM"/></C:comp-filter></C:comp-filter>',
    );

    expect(unsupported.names).toEqual(['comp-filter[VEVENT/VALARM]']);
  });

  describe('prop-filter on SUMMARY', () => {
    it('accepts is-not-defined', () => {
      const { filter } = filterOf(
        '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter name="SUMMARY"><C:is-not-defined/></C:prop-filter></C:comp-filter></C:comp-filter>',
      );

      expect(filter).toMatchObject({
        propFilters: [{ name: 'SUMMARY', isNotDefined: true, textMatch: null }],
      });
    });

    it('accepts a text-match, uppercasing the property name and lowercasing the collation', () => {
      const { filter } = filterOf(
        '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter name="summary"><C:text-match collation="I;ASCII-CASEMAP" negate-condition="yes">team</C:text-match></C:prop-filter></C:comp-filter></C:comp-filter>',
      );

      expect(filter).toMatchObject({
        propFilters: [
          {
            name: 'SUMMARY',
            isNotDefined: false,
            textMatch: {
              value: 'team',
              negate: true,
              collation: 'i;ascii-casemap',
            },
          },
        ],
      });
    });

    it('defaults negate-condition to no and collation to i;ascii-casemap', () => {
      const { filter } = filterOf(
        '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter name="SUMMARY"><C:text-match>x</C:text-match></C:prop-filter></C:comp-filter></C:comp-filter>',
      );

      expect(filter).toMatchObject({
        propFilters: [
          { textMatch: { negate: false, collation: 'i;ascii-casemap' } },
        ],
      });
    });

    it('combines several prop-filters by AND (no client-selectable combinator)', () => {
      const { filter } = filterOf(
        '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">' +
          '<C:prop-filter name="SUMMARY"><C:text-match>a</C:text-match></C:prop-filter>' +
          '<C:prop-filter name="SUMMARY"><C:is-not-defined/></C:prop-filter>' +
          '</C:comp-filter></C:comp-filter>',
      );

      expect(filter.kind).toBe('vevent');
      if (filter.kind === 'vevent') {
        expect(filter.propFilters).toHaveLength(2);
      }
    });

    it('rejects a prop-filter on any property other than SUMMARY', () => {
      const { unsupported } = filterOf(
        '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter name="LOCATION"><C:text-match>Room</C:text-match></C:prop-filter></C:comp-filter></C:comp-filter>',
      );

      expect(unsupported.names).toEqual(['LOCATION']);
    });

    it('rejects a param-filter, naming it, but still evaluates the rest of the prop-filter', () => {
      const { filter, unsupported } = filterOf(
        '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter name="SUMMARY"><C:text-match>x</C:text-match><C:param-filter name="LANGUAGE"/></C:prop-filter></C:comp-filter></C:comp-filter>',
      );

      expect(unsupported.paramFilters).toEqual(['LANGUAGE']);
      expect(filter).toMatchObject({ propFilters: [{ name: 'SUMMARY' }] });
    });

    it('rejects a property-level time-range on SUMMARY', () => {
      const { filter, unsupported } = filterOf(
        '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter name="SUMMARY"><C:time-range start="20260101T000000Z" end="20260201T000000Z"/></C:prop-filter></C:comp-filter></C:comp-filter>',
      );

      expect(unsupported.names).toEqual(['prop-filter[SUMMARY]/time-range']);
      expect(filter).toEqual({
        kind: 'vevent',
        timeRange: null,
        propFilters: [],
      });
    });

    it('rejects an unsupported collation', () => {
      const { unsupported } = filterOf(
        '<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter name="SUMMARY"><C:text-match collation="i;unicode-casemap">x</C:text-match></C:prop-filter></C:comp-filter></C:comp-filter>',
      );

      expect(unsupported.collations).toEqual(['i;unicode-casemap']);
    });

    it.each(['i;ascii-casemap', 'i;octet', 'default', 'I;ASCII-CASEMAP'])(
      'accepts the collation %s',
      (collation) => {
        const { unsupported } = filterOf(
          `<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter name="SUMMARY"><C:text-match collation="${collation}">x</C:text-match></C:prop-filter></C:comp-filter></C:comp-filter>`,
        );

        expect(unsupported.collations).toEqual([]);
      },
    );
  });
});

describe('parseTimeRangeElement', () => {
  const el = (attrs: string) =>
    create(`<C:time-range xmlns:C="${CALDAV}" ${attrs}/>`).root();

  it('accepts a range with only start, only end, or both', () => {
    expect(parseTimeRangeElement(el('start="20260101T000000Z"'))).toEqual({
      start: new Date('2026-01-01T00:00:00Z'),
      end: null,
    });
    expect(parseTimeRangeElement(el('end="20260101T000000Z"'))).toEqual({
      start: null,
      end: new Date('2026-01-01T00:00:00Z'),
    });
    expect(
      parseTimeRangeElement(
        el('start="20260101T000000Z" end="20260201T000000Z"'),
      ),
    ).toEqual({
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-02-01T00:00:00Z'),
    });
  });

  it('rejects a range with neither attribute', () => {
    expect(() => parseTimeRangeElement(el(''))).toThrow();
  });

  it('rejects end not after start', () => {
    expect(() =>
      parseTimeRangeElement(
        el('start="20260201T000000Z" end="20260101T000000Z"'),
      ),
    ).toThrow();
    expect(() =>
      parseTimeRangeElement(
        el('start="20260101T000000Z" end="20260101T000000Z"'),
      ),
    ).toThrow();
  });

  it('rejects an unparsable start or end', () => {
    expect(() => parseTimeRangeElement(el('start="nope"'))).toThrow();
    expect(() => parseTimeRangeElement(el('end="nope"'))).toThrow();
  });
});

describe('parseFilterElement', () => {
  it('throws when there is no comp-filter', () => {
    const root = create(`<C:filter xmlns:C="${CALDAV}"/>`).root();
    expect(() => parseFilterElement(root)).toThrow();
  });

  it('throws when a comp-filter has no name', () => {
    const root = create(
      `<C:filter xmlns:C="${CALDAV}"><C:comp-filter/></C:filter>`,
    ).root();
    expect(() => parseFilterElement(root)).toThrow();
  });

  it('throws when a prop-filter or param-filter has no name', () => {
    const noProp = create(
      `<C:filter xmlns:C="${CALDAV}"><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter/></C:comp-filter></C:comp-filter></C:filter>`,
    ).root();
    expect(() => parseFilterElement(noProp)).toThrow();

    const noParam = create(
      `<C:filter xmlns:C="${CALDAV}"><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter name="SUMMARY"><C:param-filter/></C:prop-filter></C:comp-filter></C:comp-filter></C:filter>`,
    ).root();
    expect(() => parseFilterElement(noParam)).toThrow();
  });

  it('throws for an invalid negate-condition', () => {
    const root = create(
      `<C:filter xmlns:C="${CALDAV}"><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter name="SUMMARY"><C:text-match negate-condition="maybe">x</C:text-match></C:prop-filter></C:comp-filter></C:comp-filter></C:filter>`,
    ).root();
    expect(() => parseFilterElement(root)).toThrow();
  });
});

describe('parseCalendarQueryRequestBody', () => {
  function body(inner: string): string {
    return `<C:calendar-query xmlns:D="DAV:" xmlns:C="${CALDAV}"><D:prop><D:getetag/><C:calendar-data/></D:prop>${inner}</C:calendar-query>`;
  }

  it("parses RFC 4791's time-range example", () => {
    const parsed = parseCalendarQueryRequestBody(
      body(
        '<C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:time-range start="20060104T000000Z" end="20060105T000000Z"/></C:comp-filter></C:comp-filter></C:filter>',
      ),
    );

    expect(parsed.filter).toEqual({
      kind: 'vevent',
      timeRange: {
        start: new Date('2006-01-04T00:00:00Z'),
        end: new Date('2006-01-05T00:00:00Z'),
      },
      propFilters: [],
    });
    expect(parsed.unsupported).toEqual({
      names: [],
      paramFilters: [],
      collations: [],
    });
    expect(parsed.timezoneText).toBeNull();
  });

  it('reads a <C:timezone> element verbatim', () => {
    const tz =
      'BEGIN:VCALENDAR\nBEGIN:VTIMEZONE\nTZID:X\nEND:VTIMEZONE\nEND:VCALENDAR';
    const parsed = parseCalendarQueryRequestBody(
      body(
        `<C:filter><C:comp-filter name="VCALENDAR"/></C:filter><C:timezone>${tz}</C:timezone>`,
      ),
    );

    expect(parsed.timezoneText).toBe(tz);
  });

  it('rejects a wrong root element, and a body with no CALDAV:filter', () => {
    expect(() =>
      parseCalendarQueryRequestBody(
        `<C:calendar-multiget xmlns:D="DAV:" xmlns:C="${CALDAV}"><D:href>/x</D:href></C:calendar-multiget>`,
      ),
    ).toThrow();
    expect(() =>
      parseCalendarQueryRequestBody(
        `<C:calendar-query xmlns:D="DAV:" xmlns:C="${CALDAV}"><D:prop/></C:calendar-query>`,
      ),
    ).toThrow();
  });

  it('reads the property selection like other CalDAV REPORTs', () => {
    const parsed = parseCalendarQueryRequestBody(
      body('<C:filter><C:comp-filter name="VCALENDAR"/></C:filter>'),
    );

    expect(parsed.selection.kind).toBe('prop');
  });
});
