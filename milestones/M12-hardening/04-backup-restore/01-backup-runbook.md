# Sub-Task: Backup-Runbook je DB-Engine

## Kontext
Da alle Inhalte (Dateien, vCards, iCalendar-Objekte) in der Datenbank
liegen (Runde 15), ist ein Datenbank-Backup ein **vollständiges**
Backup — keine separate Dateisystem-Sicherung nötig. Für alle drei
unterstützten Engines (Runde 3: Postgres, SQLite, MySQL/MariaDB)
getrennt dokumentieren, da Befehle/Vorgehen unterschiedlich sind.

## Aufgabe
- Dokumentations-Abschnitt (`docs/operations/backup.md` o.ä.) mit
  konkreten, kopierbaren Befehlen:
  - **PostgreSQL**: `pg_dump` (Custom-Format, komprimiert) gegen den
    laufenden Compose-Service, inkl. Beispiel für automatisierten
    Aufruf via externem Cron (Host- oder separater Backup-Container-
    Ebene, **nicht** in der DavNode-Anwendung selbst)
  - **MySQL/MariaDB**: `mysqldump` analog
  - **SQLite**: Online-sicheres Backup über `VACUUM INTO` bzw. das
    SQLite-`.backup`-Kommando (vermeidet Inkonsistenzen durch
    gleichzeitige Schreibzugriffe — ein reines `cp` der `.sqlite`-Datei
    während des Betriebs ist **nicht** sicher, das wird explizit als
    Anti-Pattern benannt)
- Empfehlungen zu Frequenz/Aufbewahrung als **Richtwerte**, nicht als
  vom Server erzwungene Policy (Betriebsentscheidung, keine
  Server-Funktion, siehe Abgrenzung in
  [00-setting-goal.md](../../00-setting-goal.md))
- Hinweis, dass ein Restore die **komplette** Anwendungs-Historie
  wiederherstellt (Nutzer, ACLs, Quota-Zähler, alle drei
  Ressourcen-Domänen) — Konsequenz der Alles-in-der-DB-Entscheidung

## Akzeptanzkriterien
- [ ] Für jede der drei Engines existiert ein kopierbarer,
      funktionierender Befehl (manuell verifiziert)
- [ ] SQLite-Abschnitt warnt explizit vor rohem Datei-`cp` während des
      Betriebs
- [ ] Dokumentation ist aus dem Haupt-README verlinkt

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 15, 27
