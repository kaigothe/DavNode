import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, parseLogLevel, requestContext } from './logger.js';

/** A logger plus everything it wrote, parsed line by line. */
function capture(level: Parameters<typeof createLogger>[0]) {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(...chunk.toString().split('\n').filter(Boolean));
      callback();
    },
  });
  return {
    logger: createLogger(level, stream),
    lines,
    entries: () =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('createLogger', () => {
  it('writes one valid JSON object per line with timestamp, level and message', () => {
    const { logger, entries } = capture('info');

    logger.info({ answer: 42 }, 'hello');
    logger.warn('careful');

    const [first, second] = entries();
    expect(first).toMatchObject({
      level: 'info',
      message: 'hello',
      answer: 42,
    });
    expect(Date.parse(first!['timestamp'] as string)).not.toBeNaN();
    expect(second).toMatchObject({ level: 'warn', message: 'careful' });
  });

  it('adds the request id to every line written inside a request context, and only there', () => {
    const { logger, entries } = capture('info');

    logger.info('outside');
    requestContext.run({ requestId: 'req-1' }, () => {
      logger.info('first');
      return Promise.resolve().then(() => logger.info('after an await'));
    });

    const [outside, first] = entries();
    expect(outside).not.toHaveProperty('requestId');
    expect(first).toMatchObject({ requestId: 'req-1' });
  });

  it('keeps the request id across asynchronous steps', async () => {
    const { logger, entries } = capture('info');

    await requestContext.run({ requestId: 'req-2' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      logger.info('later');
    });

    expect(entries()[0]).toMatchObject({ requestId: 'req-2' });
  });

  it('suppresses lines below the configured level', () => {
    const { logger, lines } = capture('error');

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: 'error',
      message: 'e',
    });
  });

  it('writes nothing when silent', () => {
    const { logger, lines } = capture('silent');

    logger.error('e');

    expect(lines).toHaveLength(0);
  });

  it('redacts credentials wherever they appear, on every level, including debug', () => {
    const { logger, lines } = capture('debug');
    const secret = 'S3cr3t-value-that-must-not-leak';

    logger.debug({ password: secret }, 'a');
    logger.info({ user: { password: secret, passwordHash: secret } }, 'b');
    logger.warn(
      { digestHa1: secret, token: secret, authorization: `Basic ${secret}` },
      'c',
    );
    logger.error(
      { req: { headers: { authorization: secret, cookie: secret } } },
      'd',
    );
    logger.info({ credential: { digestHa1: secret, token: secret } }, 'e');

    expect(lines).toHaveLength(5);
    expect(lines.join('\n')).not.toContain(secret);
    expect(lines.join('\n')).toContain('[redacted]');
  });

  it('serializes an error without the extra properties a database error carries', () => {
    const { logger, lines } = capture('error');
    const error = Object.assign(new Error('query failed'), {
      parameters: ['hunter2-password-hash'],
      query: 'INSERT ...',
    });

    logger.error({ err: error }, 'failed');

    const entry = JSON.parse(lines[0]!) as { err: Record<string, unknown> };
    expect(entry.err).toMatchObject({ type: 'Error', message: 'query failed' });
    expect(entry.err['stack']).toBeTruthy();
    expect(lines[0]).not.toContain('hunter2');
  });
});

describe('parseLogLevel', () => {
  it('defaults to info and accepts the four levels in any case', () => {
    expect(parseLogLevel(undefined)).toBe('info');
    expect(parseLogLevel('  ')).toBe('info');
    expect(parseLogLevel('DEBUG')).toBe('debug');
    expect(parseLogLevel('warn')).toBe('warn');
  });

  it('rejects an unknown level with the known ones named', () => {
    expect(() => parseLogLevel('verbose')).toThrow(/error, warn, info, debug/);
  });
});
