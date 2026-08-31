# Große Aufgabe: Principals & REPORT-Infrastruktur

## Ziel
Clients können den Principals-Baum eines Tenants per PROPFIND
durchsuchen und per `principal-property-search`-REPORT gezielt nach
Nutzern/Gruppen suchen (nötig, um ihnen z.B. über die ACL-Methode Rechte
zu geben). Die dafür gebaute generische REPORT-Infrastruktur wird von
späteren Meilensteinen (M4 sync-collection, M5/M6 CalDAV/CardDAV-
REPORTs) wiederverwendet.

## Sub-Tasks
1. [Principals-Collection-Route](01-principals-collection-route.md)
2. [Generischer REPORT-Dispatcher](02-generic-report-dispatcher.md)
3. [principal-property-search-REPORT](03-principal-property-search-report.md)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 3744 §9.4, RFC 3253 (REPORT-Infrastruktur)
- [planning/05-data-model.md](../../../planning/05-data-model.md) — URL-Schema
