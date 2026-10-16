import { describe, expect, it } from 'vitest';
import {
  decodeQuotedPrintable,
  parseVCard,
  VCardParseError,
} from './vcard-parser.js';

const VCARD_4_0 = [
  'BEGIN:VCARD',
  'VERSION:4.0',
  'UID:urn:uuid:1234-5678',
  'FN:Forrest Gump',
  'N:Gump;Forrest;;;',
  'EMAIL;TYPE=work:forrest@example.com',
  'EMAIL;TYPE=home:forrest@home.example.com',
  'TEL;TYPE=work,voice:tel:+11115551212',
  'TEL;TYPE=home:tel:+14045551212',
  'ORG:Bubba Gump Shrimp Co.',
  'NICKNAME:Bubba',
  'END:VCARD',
].join('\r\n');

const VCARD_3_0 = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'UID:uid-v3-example',
  'FN:Jenny Curran',
  'N:Curran;Jenny;;;',
  'EMAIL;TYPE=INTERNET:jenny@example.com',
  'TEL;TYPE=CELL:555-0100',
  'ORG:Greenbow High',
  'NICKNAME:Jenny',
  'END:VCARD',
].join('\r\n');

describe('parseVCard', () => {
  it('parses a valid vCard 4.0 with all extracted fields, including multi-valued ones', () => {
    const parsed = parseVCard(VCARD_4_0);

    expect(parsed.version).toBe('4.0');
    expect(parsed.uid).toBe('urn:uuid:1234-5678');
    expect(parsed.fn).toEqual(['Forrest Gump']);
    expect(parsed.n).toEqual(['Gump;Forrest;;;']);
    expect(parsed.email).toEqual([
      'forrest@example.com',
      'forrest@home.example.com',
    ]);
    expect(parsed.tel).toEqual(['tel:+11115551212', 'tel:+14045551212']);
    expect(parsed.org).toEqual(['Bubba Gump Shrimp Co.']);
    expect(parsed.nickname).toEqual(['Bubba']);
  });

  it('accepts a valid vCard 3.0', () => {
    const parsed = parseVCard(VCARD_3_0);

    expect(parsed.version).toBe('3.0');
    expect(parsed.uid).toBe('uid-v3-example');
    expect(parsed.fn).toEqual(['Jenny Curran']);
    expect(parsed.email).toEqual(['jenny@example.com']);
    expect(parsed.tel).toEqual(['555-0100']);
    expect(parsed.org).toEqual(['Greenbow High']);
  });

  it('returns an empty array for a property that never occurs', () => {
    const parsed = parseVCard(VCARD_3_0);

    expect(parsed.nickname).toEqual(['Jenny']);
    const withoutNickname = parseVCard(
      VCARD_3_0.replace('NICKNAME:Jenny\r\n', ''),
    );
    expect(withoutNickname.nickname).toEqual([]);
  });

  it('rejects a vCard missing the required UID property', () => {
    const withoutUid = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:No Uid',
      'END:VCARD',
    ].join('\r\n');

    expect(() => parseVCard(withoutUid)).toThrow(VCardParseError);
    expect(() => parseVCard(withoutUid)).toThrow(/UID/);
  });

  it('rejects obviously broken input with a recognizable error, not a raw crash', () => {
    expect(() => parseVCard('this is not a vcard at all')).toThrow(
      VCardParseError,
    );
  });

  describe('vCard 3.0 compatibility (M11)', () => {
    const card = (...lines: string[]) =>
      ['BEGIN:VCARD', 'VERSION:3.0', 'UID:u1', ...lines, 'END:VCARD', ''].join(
        '\r\n',
      );

    it('decodes quoted-printable umlauts using the declared charset', () => {
      const parsed = parseVCard(
        card(
          'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:J=C3=BCrgen M=C3=BCller',
          'NICKNAME;ENCODING=QUOTED-PRINTABLE;CHARSET=ISO-8859-1:J=FCrgi',
        ),
      );

      expect(parsed.fn).toEqual(['Jürgen Müller']);
      expect(parsed.nickname).toEqual(['Jürgi']);
    });

    it('decodes per component, so an encoded semicolon stays inside its component', () => {
      const parsed = parseVCard(
        card('N;ENCODING=QUOTED-PRINTABLE:M=C3=BCller=3BSr;J=C3=BCrgen;;;'),
      );

      expect(parsed.n).toEqual(['Müller\\;Sr;Jürgen;;;']);
    });

    it('joins quoted-printable soft line breaks', () => {
      const parsed = parseVCard(
        card('FN;ENCODING=QUOTED-PRINTABLE:Dr. J=C3=BCr=', 'gen M=C3=BCller'),
      );

      expect(parsed.fn).toEqual(['Dr. Jürgen Müller']);
    });

    it('leaves a plain value alone, even if it contains an equals sign', () => {
      const parsed = parseVCard(card('FN:a=C3=BC b'));

      expect(parsed.fn).toEqual(['a=C3=BC b']);
    });

    it('reduces every spelling of the TYPE parameter to the same list', () => {
      const parsed = parseVCard(
        card(
          'TEL;TYPE=HOME;TYPE=VOICE:1',
          'TEL;TYPE="HOME,VOICE":2',
          'TEL;TYPE=home,voice:3',
          'TEL;TYPE=Voice;TYPE=voice:4',
          'TEL:5',
        ),
      );

      const types = parsed.typed
        .filter((property) => property.name === 'TEL')
        .map((property) => [property.value, property.types]);
      expect(types).toEqual([
        ['1', ['home', 'voice']],
        ['2', ['home', 'voice']],
        ['3', ['home', 'voice']],
        ['4', ['voice']],
        ['5', []],
      ]);
    });

    it('exposes TYPE for vCard 4.0 documents the same way', () => {
      const parsed = parseVCard(
        VCARD_4_0.replace('EMAIL;TYPE=work:', 'EMAIL;TYPE="work,pref":'),
      );

      expect(
        parsed.typed.find((property) => property.name === 'EMAIL')?.types,
      ).toEqual(['work', 'pref']);
    });

    it('ignores unknown X- properties without failing', () => {
      const parsed = parseVCard(
        card(
          'FN:Ann',
          'X-ABADR:de',
          'X-ABUID:ABC:ABPerson',
          'X-CUSTOM;FOO=bar:baz',
        ),
      );

      expect(parsed.fn).toEqual(['Ann']);
      expect(parsed.typed.map((property) => property.name)).toEqual(['FN']);
    });

    it.each(['2.1', '5.0', ''])(
      'rejects unsupported VERSION "%s"',
      (version) => {
        const raw = [
          'BEGIN:VCARD',
          `VERSION:${version}`,
          'UID:u1',
          'FN:x',
          'END:VCARD',
          '',
        ].join('\r\n');

        expect(() => parseVCard(raw)).toThrow(VCardParseError);
      },
    );
  });

  describe('decodeQuotedPrintable', () => {
    it('decodes bytes, keeps literal text and stray equals signs', () => {
      expect(decodeQuotedPrintable('a=3Db=C3=A4 c=')).toBe('a=bä c=');
      expect(decodeQuotedPrintable('=E2=82=AC')).toBe('€');
      expect(decodeQuotedPrintable('😀=3F')).toBe('😀?');
    });

    it('falls back to UTF-8 for an unknown charset', () => {
      expect(decodeQuotedPrintable('=C3=BC', 'no-such-charset')).toBe('ü');
    });
  });
});
