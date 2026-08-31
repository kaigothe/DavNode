# Sub-Task: Lock-Evaluation genericizen & instanziieren

## Kontext
Löst den in
[M4-Lock-Evaluation](../../M4-locking-sync/02-lock-evaluation/00-overview.md)
angekündigten Retrofit ein: `collect-locks.ts` war zunächst konkret auf
`collection_locks`/`file_locks` zugeschnitten.

## Aufgabe
- `packages/core/src/webdav/locking/collect-locks.ts` (M4) um
  TypeScript-Generics erweitern (Vorbild:
  [collect-aces.ts aus M3](../../M3-webdav-acl/03-acl-evaluation-engine/01-ace-collection-with-inheritance.md),
  das von Anfang an so gebaut wurde) — Parameter: Lock-Repository/
  Entity-Typ statt hartkodiertem `collection_locks`/`file_locks`-Zugriff
- **Regressionstest**: bestehende M4-Tests (WebDAV-Locking) laufen nach
  dem Refactoring unverändert grün — reines Refactoring, kein
  Verhaltenswechsel für die WebDAV-Domäne
- Instanziierung für `AddressbookLock`/`AddressObjectLock`
- LOCK/UNLOCK-Routen (M4-Vorbild:
  [Lock-Erzeugung](../../M4-locking-sync/03-lock-method/01-lock-creation.md),
  [UNLOCK-Handler](../../M4-locking-sync/04-unlock-method/01-unlock-handler.md))
  auf CardDAV-Ressourcen anwenden
- [Lock-Enforcement-Middleware aus M4](../../M4-locking-sync/05-lock-enforcement-middleware/01-if-header-enforcement.md)
  um die CardDAV-Methoden-Tabelle ergänzen (analog zur dortigen
  WebDAV-Tabelle: PUT-Überschreiben/PROPPATCH → Zielressource, PUT-
  Neuanlage → Adressbuch, DELETE → Zielressource + Adressbuch)

## Akzeptanzkriterien
- [ ] Alle bestehenden M4-Tests laufen nach dem Refactoring weiterhin
      grün (keine Regression)
- [ ] LOCK auf einen Kontakt funktioniert (exclusive/shared, Konflikt-
      Erkennung) analog zu M4s WebDAV-Tests
- [ ] LOCK mit `Depth: infinity` auf einem Adressbuch sperrt auch dessen
      Kontakte (Vererbung funktioniert wie bei WebDAV-Collections)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 20
