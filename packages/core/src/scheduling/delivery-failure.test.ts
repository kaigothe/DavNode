import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLogSink } from '../logging/log-sink.js';
import { attemptDelivery } from './delivery-failure.js';

const target = {
  uid: 'event-1',
  method: 'REQUEST' as const,
  recipientPrincipalId: 'principal-1',
};

afterEach(() => setLogSink());

describe('attemptDelivery', () => {
  it('returns null when the delivery goes through', async () => {
    const deliver = vi.fn().mockResolvedValue(undefined);

    expect(await attemptDelivery(target, deliver)).toBeNull();
    expect(deliver).toHaveBeenCalledOnce();
  });

  it('returns the failure and logs it, without throwing', async () => {
    const warn = vi.fn();
    setLogSink({ info: vi.fn(), warn, error: vi.fn() });
    const error = new Error('storage full');

    const failure = await attemptDelivery(target, () => Promise.reject(error));

    expect(failure).toEqual({ ...target, error });
    expect(warn).toHaveBeenCalledWith(
      'A scheduling message could not be delivered',
      { ...target, err: error },
    );
  });

  it('does not put the recipient address into the log', async () => {
    const warn = vi.fn();
    setLogSink({ info: vi.fn(), warn, error: vi.fn() });

    await attemptDelivery(target, () => Promise.reject(new Error('x')));

    expect(JSON.stringify(warn.mock.calls)).not.toContain('mailto');
  });
});
