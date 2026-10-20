# Große Aufgabe: Kalender-/Kontakte-Ansicht

## Ziel
Ein Admin kann (strikt lesend) nachsehen, was in den Kalendern und
Adressbüchern eines Nutzers liegt, z. B. zur Fehlersuche bei
Client-Sync-Problemen. Nur sichtbar, wenn `DAVNODE_ADMIN_UI_CONTENT_VIEW`
aktiv ist (die UI erkennt das über `GET /me`-Capabilities oder ein 404 der
Inhalts-Endpoints und blendet den Menüpunkt aus).

## Sub-Tasks
1. **Einstieg**: Aus der Nutzerdetailseite Tab „Kalender“ / „Kontakte“;
   Hinweisbanner „Zugriff wird protokolliert“.
2. **Kalender**: Liste der Kalender (Name, Farbe, Anzahl Objekte, CTag),
   Ansicht der Termine im Zeitfenster (Ant Design `Calendar` für Monat plus
   Terminliste/Agenda; Wiederholungen als expandierte Instanzen), Detail-
   Drawer (Titel, Zeit, Ort, Teilnehmer, Beschreibung, optional Roh-iCal).
   Zeitzonen sauber anzeigen (Kalender-Zeitzone vs. Browser).
3. **Kontakte**: Liste der Adressbücher, Kontakttabelle mit Suche und
   Paginierung, Detail-Drawer (Name, E-Mail, Telefon, Organisation, Adresse,
   Foto-Platzhalter, optional Roh-vCard).
4. **Lesbarkeit/Last**: Zeitfenster-Begrenzung (z. B. max. 1 Jahr pro
   Abfrage), serverseitige Limits, Lazy Loading der Route.

## Akzeptanzkriterien
- [ ] Flag aus → kein Menüpunkt, Direktaufruf zeigt „nicht aktiviert“
- [ ] Keine Schreibaktion im UI erreichbar
- [ ] Wiederkehrende Termine erscheinen an den richtigen Tagen
      (Test mit RRULE, Ausnahmen, Zeitzonenwechsel)
- [ ] Große Adressbücher (≥ 10 000 Kontakte) bleiben bedienbar (Pagination)
