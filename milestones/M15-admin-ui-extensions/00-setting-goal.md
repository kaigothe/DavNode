# M15 — Admin-UI: Erweiterungen

## Setting (Kontext)
M14 lieferte die Admin-UI. Nach dem ersten Einsatz wünscht Kai Gothe vier
Erweiterungen (Reihenfolge so festgelegt am 2026-10-21):

1. **Nutzer-Detailseite mit Gruppen** — ein Klick auf einen Nutzer öffnet
   eine Detailseite (Konto, Rolle, Speicher, Aktionen) mit der Liste der
   Gruppen, in denen er ist: direkt oder über eine andere Gruppe.
2. **Visitenkarte bei Kontakten** — über der Eigenschaftenliste eine Karte im
   Visitenkarten-Format; Avatar mit **Initialen** (kein Foto aus der vCard).
3. **Logs ansehen** — Server-Admins sehen die letzten Server-Logeinträge in
   der UI. Entschieden: **nur Server-Admins**, eigenes Flag
   `DAVNODE_ADMIN_UI_LOG_VIEW` (Default aus, setzt die UI voraus), Quelle ist
   ein **Ringpuffer im Speicher** (letzte N Einträge, weg nach Neustart,
   nur diese Instanz). Für langfristige Logs bleibt `docker logs`/ein
   Log-Dienst zuständig.
4. **Kalenderansicht wie die Apple-Kalender-App** — Tag/Woche/Monat mit
   Stundenraster, Ganztägig-Leiste, farbigen Terminblöcken, Zeit-Linie,
   Seitenleiste mit Kalendern (Farben, Häkchen, mehrere übereinander) und
   Mini-Monat. **Ein Klick auf einen Termin öffnet seine Details in dem
   Drawer, der von rechts hereinkommt.** Keine Jahresansicht.

## Ziel
Admins sehen pro Nutzer, wo er Mitglied ist; Kontakte sehen aus wie
Visitenkarten; Betreiber können Logs ohne Shell-Zugriff lesen; der
Kalender fühlt sich wie ein echter Kalender an.

## Große Aufgaben
1. Nutzer-Detailseite und Gruppen (`GET /users/{id}/groups`)
2. Visitenkarte
3. Logs (Ringpuffer, `GET /logs`, Flag, Seite)
4. Kalenderansicht (Farben aus `calendar-color`, Zeitraster, Layout)

## Stand
- ✅ 1 Nutzer-Detailseite und Gruppen (`GET /users/{id}/groups`, Seite
  `/users/:id`, Initialen-Avatar)
- ✅ 2 Visitenkarte (`ContactCard` im Kontakt-Drawer)
- ✅ 3 Logs (`LogBuffer`, `GET /logs`, `DAVNODE_ADMIN_UI_LOG_VIEW`/`_BUFFER`,
  Seite „Server log“)
- ✅ 4 Kalenderansicht im Apple-Stil (Tag/Woche/Monat, Seitenleiste, Farben
  aus `calendar-color`, Termin-Details im Drawer von rechts)
- ✅ Doku, Screenshots, Demo-Daten, E2E- und axe-Tests für alles

Abweichungen vom Plan: keine. Zusätzlich gefunden und behoben: ein Menü-Knopf
hieß fälschlich „Overview“; der axe-Lauf im echten Browser deckte mehrere
Barrierefreiheitsfehler der neuen Kalender-Komponenten auf (ARIA-Grid ohne
Zeilen, Namen ohne sichtbaren Text, doppelte Landmarks, Kontrast des
Heute-Rots im Dunkelmodus).
