# Sub-Task: Scheduling-Object-Resource-Erkennung

## Kontext
RFC 6638 §3.2: ein Kalenderobjekt ist eine "Scheduling Object Resource",
wenn sein Master-Event sowohl `ORGANIZER` als auch mindestens ein
`ATTENDEE` enthält. Nutzt den
[iCalendar-Parser-Wrapper aus M6](../../../M6-caldav/02-icalendar-parsing-and-time-range-index/01-icalendar-parser-wrapper.md)
und die
[calendar-user-address-set-Properties aus Große Aufgabe 1](../01-scheduling-data-model/02-default-calendar-and-principal-properties.md).

## Aufgabe
- `packages/core/src/scheduling/detect-scheduling-role.ts`: Funktion
  `detectSchedulingRole(parsedObject, requestingPrincipal): 'organizer' | 'attendee' | 'none'`
  - `'none'`: kein `ORGANIZER`+`ATTENDEE` vorhanden → normales, nicht
    zu schedulendes Kalenderobjekt (die meisten Termine)
  - `'organizer'`: `ORGANIZER`-Adresse matcht das
    `calendar-user-address-set` des anfragenden Principals
  - `'attendee'`: `ORGANIZER`-Adresse matcht **nicht** den anfragenden
    Principal, aber eine `ATTENDEE`-Adresse tut es
  - Matcht weder `ORGANIZER` noch `ATTENDEE` den anfragenden Principal
    (z.B. ein Admin bearbeitet fremden Kalender direkt) → ebenfalls
    `'none'` für Scheduling-Zwecke (kein automatischer Versand ausgelöst
    durch fremde Bearbeitung)
- Funktion `resolveLocalPrincipalForAddress(address, tenantId): Promise<Principal | null>`
  — löst eine `ORGANIZER`/`ATTENDEE`-Adresse (`mailto:`- oder
  Principal-URL) auf einen lokalen `User` **desselben Tenants** auf,
  `null` falls extern (siehe Abgrenzung in
  [00-setting-goal.md](../../00-setting-goal.md))

## Akzeptanzkriterien
- [ ] Ein Termin ohne `ATTENDEE` liefert `'none'`
- [ ] Ein Termin, den der Organizer selbst PUTtet, liefert `'organizer'`
- [ ] Ein Termin, den ein eingeladener Attendee auf seiner eigenen Kopie
      PUTtet, liefert `'attendee'`
- [ ] Eine `mailto:`-Adresse, die zu keinem lokalen Nutzer im Tenant
      passt, liefert `null` bei `resolveLocalPrincipalForAddress`
      (externer Attendee)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6638 §3.2
