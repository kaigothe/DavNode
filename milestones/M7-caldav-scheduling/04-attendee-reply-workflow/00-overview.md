# Große Aufgabe: Attendee-Workflow — Reply-Zustellung

## Ziel
Ändert ein Attendee seinen `PARTSTAT` auf seiner eigenen Kopie eines
Termins, wird automatisch eine REPLY-Nachricht an den (lokalen)
Organizer zugestellt **und** in dessen eigene Kopie des Termins
nachgeführt.

## Sub-Tasks
1. [PUT-Hook: PARTSTAT-Diff & Reply-Zustellung](01-put-hook-reply-delivery.md)
2. [Inbox-Merge beim Organizer](02-organizer-inbox-merge.md)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6638 §3.2.2
