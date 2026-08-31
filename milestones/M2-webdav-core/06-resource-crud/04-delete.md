# Sub-Task: DELETE

## Kontext
Löscht eine `FileResource` oder eine `Collection` (rekursiv inkl. aller
Kinder).

## Aufgabe
- `packages/server/src/http/routes/delete.route.ts`: löscht die
  Zielressource; bei einer Collection **rekursiv** alle Kind-Ressourcen
  (Sub-Collections, FileResources, deren `FileContent`,
  `*_properties`-Einträge) in einer Transaktion
- Ziel-Pfad existiert nicht → `404`
- **Root-Collection eines Tenants darf nicht gelöscht werden** →
  `403 Forbidden` (sonst wäre der Tenant "obdachlos" — kein
  WebDAV-Einstiegspunkt mehr)
- Bei Erfolg: `collection_changes`-Eintrag auf der Eltern-Collection
  (Aktion `deleted`), `syncSeq` der Eltern-Collection erhöht — bei
  rekursivem Löschen einer Collection reicht **ein** Eintrag auf deren
  direkter Eltern-Collection (nicht rekursiv für jedes Kind einzeln,
  die Kinder existieren ja nicht mehr eigenständig für Sync-Zwecke)
- Antwort: `204 No Content`

## Akzeptanzkriterien
- [ ] DELETE einer einzelnen Datei entfernt `FileResource` und
      `FileContent` vollständig (keine verwaisten Zeilen)
- [ ] DELETE einer Collection mit Kindern entfernt die gesamte
      Teil-Hierarchie (Test mit verschachtelten Sub-Collections)
- [ ] DELETE der Root-Collection liefert `403`
- [ ] DELETE eines nicht existierenden Pfads liefert `404`

## Nachtrag (sobald M8 existiert)
Sobald [M8 — Quota](../../M8-quota/00-setting-goal.md) existiert, wird
beim rekursiven Löschen die Summe der entfernten `FileContent`-Größen
je Eigentümer per `applyQuotaDelta` (negatives Delta) von dessen
Zählern abgezogen (siehe
[M8-DELETE-Retrofit](../../M8-quota/02-webdav-quota-integration/01-put-delete-retrofit.md)).
Bis M8 existiert, bleibt `quota_used_bytes` unverändert.

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918
