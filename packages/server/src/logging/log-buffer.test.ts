import { describe, expect, it } from 'vitest';
import { createBufferedDestination, LogBuffer } from './log-buffer.js';

const line = (level: string, message: string, extra: object = {}) =>
  `${JSON.stringify({ level, timestamp: '2026-10-21T10:00:00.000Z', message, ...extra })}\n`;

describe('LogBuffer', () => {
  it('keeps what pino wrote, split into level, message and fields', () => {
    const buffer = new LogBuffer(10);

    buffer.push(
      line('info', 'request completed', { method: 'GET', status: 200 }),
    );

    expect(buffer.query({ limit: 10 }).entries).toEqual([
      {
        seq: 1,
        timestamp: '2026-10-21T10:00:00.000Z',
        level: 'info',
        message: 'request completed',
        fields: { method: 'GET', status: 200 },
      },
    ]);
  });

  it('answers newest first and reports the newest sequence number', () => {
    const buffer = new LogBuffer(10);
    ['a', 'b', 'c'].forEach((m) => buffer.push(line('info', m)));

    const result = buffer.query({ limit: 2 });

    expect(result.entries.map((e) => e.message)).toEqual(['c', 'b']);
    expect(result.newest).toBe(3);
    expect(result.buffered).toBe(3);
    expect(result.capacity).toBe(10);
  });

  it('forgets the oldest entries beyond its capacity', () => {
    const buffer = new LogBuffer(3);
    ['a', 'b', 'c', 'd', 'e'].forEach((m) => buffer.push(line('info', m)));

    const result = buffer.query({ limit: 10 });

    expect(result.entries.map((e) => e.message)).toEqual(['e', 'd', 'c']);
    expect(result.buffered).toBe(3);
    expect(result.newest).toBe(5);
  });

  it('filters by the lowest level wanted (fatal counts as error)', () => {
    const buffer = new LogBuffer(10);
    buffer.push(line('debug', 'd'));
    buffer.push(line('info', 'i'));
    buffer.push(line('warn', 'w'));
    buffer.push(line('error', 'e'));
    buffer.push(line('fatal', 'f'));

    const messages = (minLevel: string) =>
      buffer.query({ limit: 10, minLevel }).entries.map((e) => e.message);

    expect(messages('error')).toEqual(['f', 'e']);
    expect(messages('warn')).toEqual(['f', 'e', 'w']);
    expect(messages('info')).toEqual(['f', 'e', 'w', 'i']);
    expect(messages('debug')).toEqual(['f', 'e', 'w', 'i', 'd']);
  });

  it('searches the message and the fields, ignoring case', () => {
    const buffer = new LogBuffer(10);
    buffer.push(
      line('info', 'Admin read user content', { resource: 'events' }),
    );
    buffer.push(line('info', 'request completed', { path: '/dav/acme/files' }));

    const found = (text: string) =>
      buffer.query({ limit: 10, text }).entries.map((e) => e.message);

    expect(found('ADMIN READ')).toEqual(['Admin read user content']);
    expect(found('/dav/acme')).toEqual(['request completed']);
    expect(found('nothing')).toEqual([]);
  });

  it('returns only what is new after a sequence number', () => {
    const buffer = new LogBuffer(10);
    ['a', 'b', 'c'].forEach((m) => buffer.push(line('info', m)));

    expect(
      buffer.query({ limit: 10, after: 1 }).entries.map((e) => e.message),
    ).toEqual(['c', 'b']);
    expect(buffer.query({ limit: 10, after: 3 }).entries).toEqual([]);
  });

  it('keeps a line that is not JSON as a plain message', () => {
    const buffer = new LogBuffer(10);

    buffer.push('plain text\n');

    const [entry] = buffer.query({ limit: 1 }).entries;
    expect(entry).toMatchObject({
      level: 'info',
      message: 'plain text',
      fields: {},
    });
  });

  it('ignores blank lines', () => {
    const buffer = new LogBuffer(10);

    buffer.push('\n');
    buffer.push('   ');

    expect(buffer.query({ limit: 10 }).buffered).toBe(0);
  });

  it('shortens a huge line instead of storing it whole', () => {
    const buffer = new LogBuffer(10);

    buffer.push(line('info', 'x'.repeat(50_000)));

    const [entry] = buffer.query({ limit: 1 }).entries;
    expect(entry?.message.length).toBeLessThanOrEqual(2_000);
    expect(entry?.fields).toEqual({ truncated: true });
  });

  it('needs a positive capacity', () => {
    expect(() => new LogBuffer(0)).toThrow();
  });
});

describe('createBufferedDestination', () => {
  it('writes every line to the target and into the buffer', () => {
    const buffer = new LogBuffer(10);
    const written: string[] = [];
    const destination = createBufferedDestination(buffer, {
      write: (text) => written.push(text),
    });

    destination.write(line('warn', 'careful'));

    expect(written).toEqual([line('warn', 'careful')]);
    expect(buffer.query({ limit: 1 }).entries[0]?.message).toBe('careful');
  });
});
