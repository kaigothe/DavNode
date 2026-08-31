# Sub-Task: sync-collection für Addressbücher

## Kontext
Löst den in
[M4-sync-collection-Handler](../../M4-locking-sync/07-sync-collection-report/02-sync-collection-handler.md)
angekündigten Retrofit ein: der Handler war zunächst konkret auf
`collection_changes` zugeschnitten.

## Aufgabe
- Change-Log-Repository-Abstraktion einführen (Interface mit z.B.
  `loadChangesSince(resourceId, seq): Promise<ChangeEntry[]>`), die der
  `sync-collection`-Handler aus M4 nutzt, statt direkt auf
  `collection_changes` zuzugreifen
- **Regressionstest**: bestehende M4-Tests (WebDAV-Sync) laufen nach dem
  Refactoring unverändert grün
- Konkrete Implementierung für `addressbook_changes`
- `sync-collection`-REPORT für `/dav/{tenant}/addressbooks/{userId}/{addressbookId}/`
  registrieren (nutzt den REPORT-Dispatcher aus M3, wie in M4 für
  WebDAV-Collections)

## Akzeptanzkriterien
- [ ] Alle bestehenden M4-Tests laufen nach dem Refactoring weiterhin
      grün (keine Regression)
- [ ] `sync-collection` auf ein Adressbuch liefert Änderungen (neue/
      geänderte/gelöschte Kontakte) analog zu M4s WebDAV-Verhalten,
      inkl. Sync-Token-Roundtrip

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 20
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6578
