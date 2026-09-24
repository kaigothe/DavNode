import { describe, expect, it } from 'vitest';
import { filterVCardProperties, readVCardVersion } from './vcard-partial.js';

const CARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'UID:uid-1',
  'FN:Forrest Gump',
  'N:Gump;Forrest;;;',
  'EMAIL;TYPE=work:forrest@example.com',
  'item1.EMAIL:other@example.com',
  'TEL;TYPE=cell:+1 555 0100',
  'NOTE:a very long note that is folded onto a second line so it has a',
  ' continuation line',
  'PHOTO;ENCODING=b;TYPE=JPEG:AAAA',
  ' BBBB',
  'END:VCARD',
  '',
].join('\r\n');

describe('filterVCardProperties', () => {
  it('keeps BEGIN, VERSION and END plus exactly the selected properties', () => {
    const result = filterVCardProperties(CARD, [
      { name: 'FN', noValue: false },
      { name: 'UID', noValue: false },
    ]);

    expect(result).toBe(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'UID:uid-1',
        'FN:Forrest Gump',
        'END:VCARD',
        '',
      ].join('\r\n'),
    );
  });

  it('matches property names case-insensitively', () => {
    const result = filterVCardProperties(CARD, [
      { name: 'fn', noValue: false },
    ]);

    expect(result).toContain('FN:Forrest Gump');
  });

  it('lets an unprefixed name match the property with or without a group prefix', () => {
    const result = filterVCardProperties(CARD, [
      { name: 'EMAIL', noValue: false },
    ]);

    expect(result).toContain('EMAIL;TYPE=work:forrest@example.com');
    expect(result).toContain('item1.EMAIL:other@example.com');
  });

  it('matches a group-prefixed name only against exactly that group', () => {
    const result = filterVCardProperties(CARD, [
      { name: 'item1.EMAIL', noValue: false },
    ]);

    expect(result).toContain('item1.EMAIL:other@example.com');
    expect(result).not.toContain('forrest@example.com');
  });

  it('carries a selected property’s folded continuation lines and drops an unselected one’s', () => {
    const kept = filterVCardProperties(CARD, [
      { name: 'NOTE', noValue: false },
    ]);
    expect(kept).toContain(
      [
        'NOTE:a very long note that is folded onto a second line so it has a',
        ' continuation line',
      ].join('\r\n'),
    );

    const dropped = filterVCardProperties(CARD, [
      { name: 'FN', noValue: false },
    ]);
    expect(dropped).not.toContain('continuation line');
    expect(dropped).not.toContain('BBBB');
  });

  it('returns only name and parameters with a trailing colon for novalue="yes"', () => {
    const result = filterVCardProperties(CARD, [
      { name: 'EMAIL', noValue: true },
      { name: 'PHOTO', noValue: true },
    ]);

    expect(result).toContain('\r\nEMAIL;TYPE=work:\r\n');
    expect(result).toContain('PHOTO;ENCODING=b;TYPE=JPEG:\r\n');
    expect(result).not.toContain('AAAA');
    expect(result).not.toContain('example.com');
  });

  it('does not cut a novalue property at a colon inside a quoted parameter value', () => {
    const vcard =
      'BEGIN:VCARD\nVERSION:4.0\nTEL;PREF="1:x":tel:+1\nEND:VCARD\n';

    const result = filterVCardProperties(vcard, [
      { name: 'TEL', noValue: true },
    ]);

    expect(result).toBe(
      'BEGIN:VCARD\nVERSION:4.0\nTEL;PREF="1:x":\nEND:VCARD\n',
    );
  });

  it('preserves LF line endings and a missing trailing newline', () => {
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:A\nTEL:1\nEND:VCARD';

    const result = filterVCardProperties(vcard, [
      { name: 'FN', noValue: false },
    ]);

    expect(result).toBe('BEGIN:VCARD\nVERSION:3.0\nFN:A\nEND:VCARD');
  });

  it('keeps only BEGIN, VERSION and END for an empty selector list', () => {
    expect(filterVCardProperties(CARD, [])).toBe(
      'BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n',
    );
  });
});

describe('readVCardVersion', () => {
  it('reads the VERSION line of CRLF and LF vCards', () => {
    expect(readVCardVersion(CARD)).toBe('3.0');
    expect(readVCardVersion('BEGIN:VCARD\nVERSION:4.0\nEND:VCARD\n')).toBe(
      '4.0',
    );
  });

  it('returns null when there is no VERSION line', () => {
    expect(readVCardVersion('BEGIN:VCARD\nFN:A\nEND:VCARD\n')).toBeNull();
  });

  it('ignores a VERSION-looking line that is only a folded continuation', () => {
    expect(
      readVCardVersion('BEGIN:VCARD\nNOTE:x\n VERSION:9.9\nEND:VCARD\n'),
    ).toBeNull();
  });
});
