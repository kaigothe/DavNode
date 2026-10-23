import { getLogSink } from '@davnode/core';

/**
 * Runs a scheduling delivery (invites, replies, cancellations) that follows
 * the write the client asked for. The write is already stored (or, for an
 * attendee's delete, must still go ahead), so a delivery that throws is
 * logged and not passed on: answering 500 would make the client retry a
 * PUT that already succeeded, and each retry raises SEQUENCE again.
 *
 * Failures of single recipients are handled where they happen
 * (`attemptDelivery`); this catches what is left, such as a database error
 * while looking a recipient up.
 */
export async function deliverWithoutFailing(
  uid: string,
  deliver: () => Promise<unknown>,
): Promise<void> {
  try {
    await deliver();
  } catch (error) {
    getLogSink().warn('Scheduling delivery failed after the write', {
      uid,
      err: error,
    });
  }
}
