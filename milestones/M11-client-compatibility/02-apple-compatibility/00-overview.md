# Große Aufgabe: Apple-Kompatibilität

## Ziel
Apple Calendar/Contacts (macOS/iOS) erkennen Änderungen effizient über
die von Apples CalendarServer eingeführte `getctag`-Property.

## Sub-Tasks
1. [getctag-Property](01-getctag-property.md)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — Client-Kompatibilität-Abschnitt

## Bewusst nicht Teil dieser Aufgabe
Apples proprietäre Calendar-/Contacts-Sharing-Erweiterung
(`{http://calendarserver.org/ns/}invite`,
`allowed-sharing-modes`, ...) — jenseits von RFC 3744, deutlicher
Mehraufwand für eine Apple-exklusive Funktion. Bewusst zurückgestellt,
siehe [planning/03-open-questions.md](../../../planning/03-open-questions.md).
