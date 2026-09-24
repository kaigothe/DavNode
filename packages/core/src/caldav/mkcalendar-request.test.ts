import { describe, expect, it } from 'vitest';
import {
  MkcalendarBodyError,
  parseMkcalendarRequestBody,
} from './mkcalendar-request.js';

const CALDAV = 'urn:ietf:params:xml:ns:caldav';

function body(inner: string): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<C:mkcalendar xmlns:D="DAV:" xmlns:C="${CALDAV}">${inner}</C:mkcalendar>`;
}

function refusal(xml: string): MkcalendarBodyError {
  try {
    parseMkcalendarRequestBody(xml);
  } catch (error) {
    expect(error).toBeInstanceOf(MkcalendarBodyError);
    return error as MkcalendarBodyError;
  }
  throw new Error('expected parseMkcalendarRequestBody to throw');
}

describe('parseMkcalendarRequestBody', () => {
  it("parses RFC 4791's example, in document order", () => {
    const parsed = parseMkcalendarRequestBody(
      body(`<D:set><D:prop>
        <D:displayname>Lisa's Events</D:displayname>
        <C:calendar-description xml:lang="en">Calendar restricted to events.</C:calendar-description>
        <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>
        <C:calendar-timezone><![CDATA[BEGIN:VCALENDAR
PRODID:-//Example Corp.//CalDAV Client//EN
TZNAME:Eastern Standard Time (US & Canada)
END:VCALENDAR
]]></C:calendar-timezone>
      </D:prop></D:set>`),
    );

    expect(parsed.properties.map((p) => p.property)).toEqual([
      { namespace: 'DAV:', name: 'displayname' },
      { namespace: CALDAV, name: 'calendar-description' },
      { namespace: CALDAV, name: 'supported-calendar-component-set' },
      { namespace: CALDAV, name: 'calendar-timezone' },
    ]);
    expect(parsed.properties[0]?.text).toBe("Lisa's Events");
    expect(parsed.properties[1]?.text).toBe('Calendar restricted to events.');
  });

  it('resolves CDATA and entities in the text of a property, and keeps its stored value as written', () => {
    const [cdata, entities] = parseMkcalendarRequestBody(
      body(`<D:set><D:prop>
        <C:calendar-timezone><![CDATA[A & B <x>]]></C:calendar-timezone>
        <D:displayname>A &amp; B &lt;x&gt;</D:displayname>
      </D:prop></D:set>`),
    ).properties;

    expect(cdata?.text).toBe('A & B <x>');
    expect(cdata?.value).toBe('<![CDATA[A & B <x>]]>');
    expect(entities?.text).toBe('A & B <x>');
    expect(entities?.value).toBe('A &amp; B &lt;x&gt;');
  });

  it('lists the direct child elements of a property with their name attribute', () => {
    const [componentSet, resourcetype] = parseMkcalendarRequestBody(
      body(`<D:set><D:prop>
        <C:supported-calendar-component-set>
          <C:comp name="VEVENT"/><C:comp name="VTODO"/>
        </C:supported-calendar-component-set>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
      </D:prop></D:set>`),
    ).properties;

    expect(componentSet?.children).toEqual([
      { namespace: CALDAV, name: 'comp', nameAttribute: 'VEVENT' },
      { namespace: CALDAV, name: 'comp', nameAttribute: 'VTODO' },
    ]);
    expect(resourcetype?.children).toEqual([
      { namespace: 'DAV:', name: 'collection', nameAttribute: undefined },
      { namespace: CALDAV, name: 'calendar', nameAttribute: undefined },
    ]);
  });

  it('keeps the namespace of a client-defined property and its serialized content', () => {
    const [color] = parseMkcalendarRequestBody(
      body(`<D:set><D:prop>
        <I:calendar-color xmlns:I="http://apple.com/ns/ical/">#FF0000FF</I:calendar-color>
      </D:prop></D:set>`),
    ).properties;

    expect(color?.property).toEqual({
      namespace: 'http://apple.com/ns/ical/',
      name: 'calendar-color',
    });
    expect(color?.value).toBe('#FF0000FF');
  });

  it('processes several DAV:set blocks in order', () => {
    const parsed = parseMkcalendarRequestBody(
      body(`<D:set><D:prop><D:displayname>one</D:displayname></D:prop></D:set>
            <D:set><D:prop><D:displayname>two</D:displayname></D:prop></D:set>`),
    );

    expect(parsed.properties.map((p) => p.text)).toEqual(['one', 'two']);
  });

  it('accepts a mkcalendar without any DAV:set', () => {
    expect(parseMkcalendarRequestBody(body('')).properties).toEqual([]);
  });

  it('refuses text that is not well-formed XML as malformed', () => {
    expect(refusal('<C:mkcalendar').kind).toBe('malformed');
    expect(refusal('just text').kind).toBe('malformed');
  });

  it('refuses another root element as wrong-root, in the CalDAV namespace or not', () => {
    expect(
      refusal('<D:mkcol xmlns:D="DAV:"><D:set><D:prop/></D:set></D:mkcol>')
        .kind,
    ).toBe('wrong-root');
    expect(refusal(`<C:calendar-query xmlns:C="${CALDAV}"/>`).kind).toBe(
      'wrong-root',
    );
    expect(refusal('<mkcalendar xmlns="urn:example:other"/>').kind).toBe(
      'wrong-root',
    );
  });

  it('refuses a DAV:remove and any other child of the root as malformed', () => {
    expect(
      refusal(body('<D:remove><D:prop><D:displayname/></D:prop></D:remove>'))
        .kind,
    ).toBe('malformed');
    expect(refusal(body('<C:filter/>')).kind).toBe('malformed');
  });
});
