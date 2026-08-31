# Sub-Task: ACL-/Lock-/Sync-Instanziierung für Kalender

## Kontext
Alle drei Engines (ACL seit M3, Lock/Sync seit dem M5-Retrofit) sind
generisch über den jeweiligen Tabellentyp — hier nur noch Verdrahtung.

## Aufgabe
- `collect-aces.ts`/`evaluate-privilege.ts` mit `CalendarAce`/
  `CalendarObjectAce` parametrisieren
- `collect-locks.ts` mit `CalendarLock`/`CalendarObjectLock`
  parametrisieren; LOCK/UNLOCK-Routen und die
  [Lock-Enforcement-Middleware aus M4](../../M4-locking-sync/05-lock-enforcement-middleware/01-if-header-enforcement.md)
  um die CalDAV-Methoden-Tabelle ergänzen (analoge Zuordnung wie bei
  WebDAV/CardDAV: PUT-Überschreiben → Zielressource, PUT-Neuanlage/
  MKCALENDAR → Kalender bzw. Home-Collection, DELETE → Zielressource +
  Kalender)
- Change-Log-Repository-Abstraktion (M4/M5) mit `calendar_changes`
  parametrisieren; `sync-collection` für
  `/dav/{tenant}/calendars/{userId}/{calendarId}/` registrieren
- Privilege-je-Methode-Tabelle (M3) um CalDAV-Routen ergänzen: GET →
  `read`, PUT (Überschreiben) → `write-content`, PUT (Neuanlage)/
  MKCALENDAR → `bind`, DELETE → `unbind`
- `createOwnerAllAce`-Utility um `'calendar' | 'calendar-object'` als
  `resourceType` erweitern

## Akzeptanzkriterien
- [ ] Alle CalDAV-CRUD-Operationen (Große Aufgabe 4) laufen über die
      echte ACL-Prüfung
- [ ] LOCK/UNLOCK funktionieren auf Kalendern und einzelnen Terminen,
      inkl. Vererbung bei `Depth: infinity`
- [ ] `sync-collection` auf einen Kalender liefert Änderungen (neue/
      geänderte/gelöschte Termine) analog zu M4/M5
- [ ] Neu angelegte Kalender/Termine sind für ihren Eigentümer sofort
      zugänglich (Default-Owner-ACE)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 20, 21
