# Große Aufgabe: Scheduling-Outbox (Freebusy-Request)

## Ziel
Clients können per POST an die Scheduling-Outbox die Frei/Belegt-
Auskunft mehrerer Attendees auf einmal abfragen (RFC 6638 §3.4.3) — der
einzige in v1 unterstützte Outbox-Anwendungsfall (siehe Abgrenzung in
[00-setting-goal.md](../00-setting-goal.md)).

## Sub-Tasks
1. [freebusy-request-Handler](01-freebusy-request-handler.md)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6638 §3.4
