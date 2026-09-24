import { describe, expect, it } from 'vitest';
import { create } from 'xmlbuilder2';
import { buildMkcalendarResponse } from './mkcalendar-response-builder.js';

interface Element {
  namespace: string | null;
  name: string;
  text: string;
  children: Element[];
}

function parse(xml: string): Element {
  const read = (node: {
    localName: string;
    namespaceURI: string | null;
    textContent: string | null;
    childNodes: ArrayLike<unknown>;
  }): Element => ({
    namespace: node.namespaceURI,
    name: node.localName,
    text: node.textContent ?? '',
    children: (
      Array.from(node.childNodes) as (Parameters<typeof read>[0] & {
        nodeType: number;
      })[]
    )
      .filter((child) => child.nodeType === 1)
      .map(read),
  });
  return read(create(xml).root().node as unknown as Parameters<typeof read>[0]);
}

describe('buildMkcalendarResponse', () => {
  const CALDAV = 'urn:ietf:params:xml:ns:caldav';

  it('has a CALDAV:mkcalendar-response root', () => {
    const root = parse(buildMkcalendarResponse([]));

    expect(root.namespace).toBe(CALDAV);
    expect(root.name).toBe('mkcalendar-response');
    expect(root.children).toEqual([]);
  });

  it('groups the properties into DAV:propstat blocks by status, in first-seen order', () => {
    const root = parse(
      buildMkcalendarResponse([
        { namespace: 'DAV:', name: 'displayname', status: 200 },
        { namespace: CALDAV, name: 'calendar-description', status: 200 },
        { namespace: 'urn:example', name: 'x', status: 424 },
      ]),
    );

    expect(root.children.map((c) => [c.namespace, c.name])).toEqual([
      ['DAV:', 'propstat'],
      ['DAV:', 'propstat'],
    ]);
    const [ok, failed] = root.children;
    expect(ok?.children[0]?.children.map((p) => p.name)).toEqual([
      'displayname',
      'calendar-description',
    ]);
    expect(ok?.children[1]?.text).toBe('HTTP/1.1 200 OK');
    expect(failed?.children[0]?.children.map((p) => p.name)).toEqual(['x']);
    expect(failed?.children[1]?.text).toBe('HTTP/1.1 424 Failed Dependency');
  });

  it('embeds a property value where one is given', () => {
    const root = parse(
      buildMkcalendarResponse([
        {
          namespace: CALDAV,
          name: 'supported-calendar-component-set',
          value: `<C:comp name="VEVENT" xmlns:C="${CALDAV}"/>`,
          status: 200,
        },
      ]),
    );

    const property = root.children[0]?.children[0]?.children[0];
    expect(property?.name).toBe('supported-calendar-component-set');
    expect(property?.children.map((c) => [c.namespace, c.name])).toEqual([
      [CALDAV, 'comp'],
    ]);
  });
});
