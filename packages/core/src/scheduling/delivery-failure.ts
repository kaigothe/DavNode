import { getLogSink } from '../logging/log-sink.js';

/** One scheduling message that could not be delivered to one recipient. */
export interface DeliveryFailure {
  /** The event's `UID`. */
  uid: string;
  /** The iTIP method that was being delivered. */
  method: 'REQUEST' | 'CANCEL';
  /** The recipient's principal id (not their address: the log is not the place for it). */
  recipientPrincipalId: string;
  /** What went wrong, e.g. a `QuotaExceededError` when the recipient's storage is full. */
  error: unknown;
}

/**
 * Runs one recipient's delivery. A failure is logged and returned instead
 * of thrown, so the recipients after it still get their message, and so a
 * delivery problem never turns an already saved write into an error.
 *
 * RFC 6638 §3.2.9 would report it to the organizer per attendee, as a
 * `SCHEDULE-STATUS` parameter; for now it is only in the log.
 */
export async function attemptDelivery(
  target: Omit<DeliveryFailure, 'error'>,
  deliver: () => Promise<void>,
): Promise<DeliveryFailure | null> {
  try {
    await deliver();
    return null;
  } catch (error) {
    getLogSink().warn('A scheduling message could not be delivered', {
      uid: target.uid,
      method: target.method,
      recipientPrincipalId: target.recipientPrincipalId,
      err: error,
    });
    return { ...target, error };
  }
}
