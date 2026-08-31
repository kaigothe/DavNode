# Sub-Task: PUT

## Kontext
Legt eine `FileResource` neu an oder überschreibt sie. RFC4918 §9.7:
PUT darf wie MKCOL **keine** fehlenden Zwischen-Collections automatisch
anlegen.

## Aufgabe
- `packages/server/src/http/routes/put.route.ts`: liest Eltern-Collection
  aus dem Ziel-Pfad; existiert sie nicht → `409 Conflict`
- Neuanlage (Ziel-Pfad existiert noch nicht): legt `FileResource` +
  `FileContent` transaktional an, `ownerPrincipalId` = anfragender
  Principal, `contentType` aus dem `Content-Type`-Header (Default
  `application/octet-stream`, falls fehlend), `sizeBytes` aus der
  tatsächlichen Body-Länge (nicht blind aus `Content-Length`
  übernehmen — Diskrepanz ist ein `400 Bad Request`)
- Überschreiben (Ziel-Pfad existiert bereits als `FileResource`):
  aktualisiert `FileContent` + Metadaten in derselben Transaktion
- **ETag-Erzeugung**: SHA-256-Hash des Inhalts, hex-kodiert, als
  `etag`-Wert (deterministisch, kein zusätzlicher Zähler nötig)
- Ziel-Pfad existiert bereits als **Collection** → `409 Conflict`
  (PUT kann keine Collection überschreiben)
- **Conditional Request**: `If-Match`-Header wird geprüft, falls
  vorhanden (verhindert Lost-Update bei gleichzeitigem Schreiben) —
  Mismatch → `412 Precondition Failed`, kein Schreibvorgang
- Bei Erfolg: `collection_changes`-Eintrag auf der Eltern-Collection
  (Aktion `added` oder `modified`), `syncSeq` erhöht
- Antwort: `201 Created` (Neuanlage) bzw. `204 No Content`
  (Überschreiben), `ETag`-Header in beiden Fällen gesetzt
- **Kein** Quota-Check in M2 (Quota-Durchsetzung ist M8, siehe
  [00-setting-goal.md](../00-setting-goal.md)) — Code-Kommentar an der
  Stelle, wo der Check in M8 eingefügt wird

## Akzeptanzkriterien
- [ ] PUT auf einen neuen Pfad mit existierender Eltern-Collection
      liefert `201`, Datei ist per GET abrufbar
- [ ] PUT mit fehlender Eltern-Collection liefert `409`
- [ ] PUT auf eine existierende Datei überschreibt sie (`204`), neuer
      Inhalt ist per GET sichtbar, ETag hat sich geändert
- [ ] PUT mit falschem `If-Match` liefert `412`, Inhalt bleibt
      unverändert
- [ ] Zwei PUTs mit identischem Inhalt erzeugen denselben ETag
      (Determinismus-Test)
- [ ] `collection_changes`-Eintrag ist nach Neuanlage **und** nach
      Überschreiben nachweisbar

## Nachtrag (Runde 19, sobald M3 existiert)
Sobald [M3 — WebDAV ACL](../../M3-webdav-acl/00-setting-goal.md)
implementiert ist, muss PUT bei **Neuanlage** (nicht beim Überschreiben)
zusätzlich
`createOwnerAllAce('file', newFileResource.id, req.principal.id)`
aufrufen (RFC 3744 ist default-deny, siehe
[M3-Default-Owner-ACE-Utility](../../M3-webdav-acl/01-ace-entities-and-privileges/03-default-owner-ace-utility.md)).
Bis M3 existiert, ist der Zugriff über die M2-Platzhalter-Autorisierung
sichergestellt.

## Nachtrag (sobald M8 existiert)
Sobald [M8 — Quota](../../M8-quota/00-setting-goal.md) existiert, ruft
PUT vor dem Schreiben `applyQuotaDelta` auf (siehe
[M8-PUT-Retrofit](../../M8-quota/02-webdav-quota-integration/01-put-delete-retrofit.md))
und lehnt mit `507` ab, falls das User- oder Tenant-Limit überschritten
würde. Bis M8 existiert, gibt es — wie hier ursprünglich beschrieben —
keinen Quota-Check.

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 15 (Blob-Strategie), Runde 19
