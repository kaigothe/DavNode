# Große Aufgabe: Calendar-Home & MKCALENDAR

## Ziel
`/dav/{tenant}/calendars/{userId}/` ist als virtuelle Home-Collection
PROPFIND-fähig, und Clients können darunter per **MKCALENDAR** (RFC 4791
§5.3.1 — eigene HTTP-Methode, **nicht** Extended MKCOL) neue Kalender
anlegen.

## Sub-Tasks
1. [Calendar-Home-Route](01-calendar-home-route.md)
2. [MKCALENDAR-Handler](02-mkcalendar-handler.md)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4791 §5.2.1, §5.3.1
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 21
