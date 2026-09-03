import { describe, expect, it } from 'vitest';
import { parseVCard, VCardParseError } from './vcard-parser.js';

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
});
