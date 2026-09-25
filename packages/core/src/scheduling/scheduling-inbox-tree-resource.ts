import type { SchedulingInboxItem } from '../entities/scheduling-inbox-item.entity.js';

/**
 * A user's virtual scheduling Inbox collection (RFC 6638 §2.2,
 * `/dav/{tenant}/calendars/{userId}/inbox/`) — never persisted, mirroring
 * `CalendarHomeCollection`/`AddressbookHomeCollection` (M5/M6): the
 * collection itself is synthesized from `ownerPrincipalId`, while its
 * children are real `SchedulingInboxItem` rows.
 */
export class SchedulingInboxCollection {
  /** @param ownerPrincipalId - The principal whose inbox this is. */
  constructor(readonly ownerPrincipalId: string) {}
}

/** A node of the `/dav/{tenant}/calendars/{userId}/inbox/` subtree: the collection itself, or one of its `SchedulingInboxItem` children. */
export type SchedulingInboxTreeResource =
  SchedulingInboxCollection | SchedulingInboxItem;
