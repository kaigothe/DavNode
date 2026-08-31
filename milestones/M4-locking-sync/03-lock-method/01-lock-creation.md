# Sub-Task: Lock-Erzeugung

## Kontext
RFC 4918 §9.10.4/9.10.6. Nutzt
[Lock-Evaluation](../02-lock-evaluation/00-overview.md) für die
Konflikt-Prüfung und die
[ACL-Evaluation-Engine aus M3](../../M3-webdav-acl/03-acl-evaluation-engine/00-overview.md)
für die Berechtigungsprüfung.

## Aufgabe
- `packages/server/src/http/routes/lock.route.ts`: Request-Body
  `<D:lockinfo>` enthält `<D:lockscope>` (`exclusive`/`shared`),
  `<D:locktype>` (nur `write` unterstützt, RFC4918 kennt keinen
  anderen Typ), `<D:owner>` (roh übernommen)
- `Depth`-Header: nur `0` oder `infinity` gültig (jeder andere Wert →
  `400`); `Depth: 1` ist für LOCK laut RFC4918 nicht definiert
- **Berechtigungsprüfung** (projektspezifische, über RFC4918 hinausgehende
  Konkretisierung): `exclusive`-Lock erfordert `write-content` (Datei)
  bzw. `bind` (Collection); `shared`-Lock erfordert nur `read` — sonst
  `403`
- **Konflikt-Prüfung**: `getEffectiveLocks` + `wouldConflict` aus
  [Lock-Evaluation](../02-lock-evaluation/00-overview.md); Konflikt →
  `423 Locked` mit `<D:no-conflicting-lock/>`-Fehlerbedingung
- Bei `Depth: infinity` auf einer Collection: **jeder** Konflikt
  irgendwo im Teilbaum lehnt die gesamte Anfrage ab (bewusste
  Vereinfachung, siehe [00-setting-goal.md](../00-setting-goal.md))
- Lock-Token erzeugen (`urn:uuid:<uuid>`), Zeile in `collection_locks`
  bzw. `file_locks` anlegen, `principalId` = anfragender Principal
- Antwort: `201 Created` (neue Ressource durch Lock "reserviert" — hier
  nicht relevant, da Locked-Null-Resources ausgeklammert sind, siehe
  Abgrenzung) bzw. `200 OK` für bestehende Ressourcen, `Lock-Token`-
  Header gesetzt, Response-Body mit `<D:lockdiscovery>` (nutzt die in
  [Lock-Properties](../06-lock-properties/00-overview.md) gebaute
  Property-Logik)

## Akzeptanzkriterien
- [ ] LOCK auf eine ungesperrte Datei liefert `200`, `Lock-Token`-Header,
      gültigen `lockdiscovery`-Body
- [ ] Zweites LOCK (exclusive) auf dieselbe Datei liefert `423`
- [ ] Zwei `shared`-LOCKs auf dieselbe Datei sind beide erfolgreich
- [ ] LOCK mit `Depth: infinity` auf einer Collection mit einer bereits
      gesperrten Unter-Datei liefert `423`, ohne dass ein neuer Lock
      irgendwo angelegt wird
- [ ] `Depth: 1` liefert `400`

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918 §9.10
