# Sub-Task: CalendarObject-Retrofit

## Kontext
**Retrofit von M6**: erweitert
[M6 CalendarObject-CRUD](../../../M6-caldav/04-calendar-object-crud/01-calendar-object-crud-handlers.md)
um Aufrufe von
[applyQuotaDelta](../../01-quota-counter-utility/01-apply-quota-delta.md).
Analog zum AddressObject-Retrofit, kein COPY/MOVE in CalDAV.

## Aufgabe
- **PUT Neuanlage**: `applyQuotaDelta` mit `deltaBytes = +Byte-Länge
  von ics_data` (der **gesamte** VCALENDAR-Wrapper inkl. aller
  Overrides, siehe
  [M6-CalendarObject-Entity](../../../M6-caldav/01-calendar-domain-entities/02-calendar-object-and-content-entity.md)),
  dem anfragenden Principal angelastet
- **PUT Überschreiben**: `deltaBytes = neueGröße - alteGröße`
- **DELETE**: `deltaBytes = -Byte-Länge`
- **Wichtig**: die durch [M7-Scheduling](../../../M7-caldav-scheduling/00-setting-goal.md)
  automatisch beim Attendee eingetragenen Kalenderkopien (Auto-Filing)
  zählen **ebenfalls** zu dessen Quota — dieselbe Retrofit-Logik greift
  dort, da Auto-Filing intern denselben Schreibpfad nutzt (kein
  gesonderter Sonderfall nötig, sofern M7s Auto-Filing tatsächlich über
  denselben internen Write-Pfad läuft wie ein reguläres PUT — bei der
  M7-Umsetzung sicherstellen, dass das der Fall ist, sonst hier
  nachbessern)

## Akzeptanzkriterien
- [ ] PUT eines Termins, der das Limit überschreiten würde, liefert
      `507`
- [ ] DELETE eines Termins reduziert `quota_used_bytes` um dessen
      tatsächliche Byte-Länge (inkl. aller Overrides im selben Objekt)
- [ ] Eine automatisch beim Attendee eingetragene Einladung (M7) erhöht
      dessen `quota_used_bytes` sichtbar (Cross-Check mit M7)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 12, 15
