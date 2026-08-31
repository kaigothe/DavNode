# Sub-Task: COPY

## Kontext
RFC 4918 §9.8. Nutzt dieselbe Owner-Platzhalter-Autorisierung wie die
übrigen Methoden (Quelle: Leserecht nötig; Ziel-Eltern-Collection:
Schreibrecht nötig — in M2 vereinfacht: Ziel-Eltern-Collection muss dem
anfragenden Principal gehören).

## Aufgabe
- `packages/server/src/http/routes/copy.route.ts`: liest `Destination`-
  Header (Ziel-URL), `Overwrite`-Header (`T`/`F`, Default `T`),
  `Depth`-Header (nur `0` oder `infinity` gültig für COPY auf
  Collections — `0` kopiert nur die Collection selbst ohne Kinder,
  `infinity`/fehlend kopiert rekursiv; für FileResources ist `Depth`
  irrelevant)
- **Tenant-Grenze**: `Destination` muss innerhalb desselben Tenants
  liegen (anderer `tenantSlug` im Pfad) → `403 Forbidden` (projektspezi-
  fische Regel, über die reine RFC4918-Vorgabe hinaus — Tenants sind
  isolierte Mandanten, siehe
  [planning/01-decisions.md](../../../planning/01-decisions.md) Runde 15)
- Ziel-Eltern-Collection existiert nicht → `409 Conflict`
- Ziel existiert bereits: `Overwrite: F` → `412 Precondition Failed`;
  `Overwrite: T` (oder fehlend) → bestehendes Ziel wird ersetzt,
  Antwort `204` statt `201`
- Kopierte Ressourcen gehören dem **anfragenden Principal** (nicht dem
  Eigentümer der Quelle) — konsistent mit dem Owner-Platzhalter-Modell:
  wer kopiert, "besitzt" die Kopie
- Bei rekursivem Copy einer Collection: alle Dead-Properties werden mit
  kopiert, Live-Properties (insb. `getetag`) werden für die Kopie **neu
  berechnet**, nicht 1:1 übernommen
- Bei Erfolg: `collection_changes`-Eintrag auf der Ziel-Eltern-Collection

## Akzeptanzkriterien
- [ ] COPY einer Datei an einen neuen Ort liefert `201`, Original bleibt
      unverändert bestehen
- [ ] COPY einer Collection mit `Depth: infinity` kopiert die gesamte
      Teil-Hierarchie; `Depth: 0` kopiert nur die leere Collection
- [ ] COPY auf ein existierendes Ziel mit `Overwrite: F` liefert `412`,
      nichts wird verändert
- [ ] COPY über Tenant-Grenzen hinweg liefert `403`

## Nachtrag (Runde 19, sobald M3 existiert)
Sobald [M3 — WebDAV ACL](../../M3-webdav-acl/00-setting-goal.md)
implementiert ist, muss COPY für **jede** neu erzeugte Kopie (Collection
und/oder FileResource, auch rekursiv bei `Depth: infinity`) zusätzlich
`createOwnerAllAce(...)` für den anfragenden Principal aufrufen — die
ACEs der Quelle werden **nicht** mitkopiert, die Kopie startet mit einer
frischen Default-ACE (RFC 3744 ist default-deny, siehe
[M3-Default-Owner-ACE-Utility](../../M3-webdav-acl/01-ace-entities-and-privileges/03-default-owner-ace-utility.md)).
Bis M3 existiert, ist der Zugriff über die M2-Platzhalter-Autorisierung
sichergestellt.

## Nachtrag (sobald M8 existiert)
Sobald [M8 — Quota](../../M8-quota/00-setting-goal.md) existiert, wird
jede neu erzeugte Kopie wie eine PUT-Neuanlage behandelt:
`applyQuotaDelta` mit positivem Delta für den anfragenden Principal
(siehe
[M8-COPY-Retrofit](../../M8-quota/02-webdav-quota-integration/01-put-delete-retrofit.md)),
ein Limit-Überschreiten lehnt den gesamten COPY-Request ab. Bis M8
existiert, gibt es keinen Quota-Check bei COPY.

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 19
