# Sub-Task: Demo-Umgebung

## Aufgabe
`docker compose -f docker-compose.demo.yml up` startet DavNode mit
Seed-Daten (Demo-Tenant, 3 Nutzer, Kalender mit Terminen, Kontakte,
Dateien) und gedrucktem Login. Optional: öffentliche, täglich
zurückgesetzte Demo-Instanz (Maintainer entscheidet über Hosting).

## Akzeptanzkriterien
- [x] Ein Befehl → funktionsfähige Demo; Seed ist idempotent
- [x] Keine Standardpasswörter in öffentlich erreichbarer Instanz
