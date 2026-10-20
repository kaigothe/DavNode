# Große Aufgabe: Verwaltungsansichten

## Ziel
Alle Funktionen der Admin-API (M9/M10) sind im Browser bedienbar.

## Sub-Tasks
1. **Tenants** (`server_admin`): Tabelle (Suche, Paginierung), Anlegen,
   Bearbeiten, Löschen. Löschen verlangt die Slug-Wiederholung (API-Vorgabe
   aus M9), Dialog erklärt die Kaskade.
2. **Nutzer**: Tabelle (Suche, Rollen-Tag, Quota-Balken), Anlegen
   (Rolle nur im erlaubten Umfang wählbar: `tenant_admin` sieht kein
   `server_admin`), Bearbeiten (E-Mail, Quota, Rolle), Passwort zurücksetzen,
   OAuth2-Identität verknüpfen/lösen, Löschen mit Username-Bestätigung.
3. **Gruppen**: Tabelle, Anlegen, Löschen, Detailseite mit Mitgliedern
   (Hinzufügen/Entfernen, `Transfer`/Select mit Suche) und Ansicht der
   effektiven Mitglieder (verschachtelte Gruppen).
4. **Quota**: Übersicht pro Tenant/Nutzer (Nutzung vs. Limit), Limits
   ändern, „Neu berechnen“ (`/quota/recompute`) mit Rückmeldung zum
   laufenden Job. Bytes menschenlesbar, Eingabe in MB/GB.
5. **Provider** (read-only): Karten für Basic/Digest/OAuth2 mit Status und
   Issuern aus `GET /providers`; Hinweis, dass Änderungen per
   Server-Konfiguration erfolgen.
6. **Gemeinsame Bausteine**: wiederverwendbare Tabelle (serverseitige
   Pagination/Suche), Bestätigungsdialog für destruktive Aktionen,
   Formular-Validierung mit Server-Fehlerabbildung, Leer-/Ladezustände,
   Erfolgs-/Fehler-Toasts (zweisprachig).

## Akzeptanzkriterien
- [ ] Jede Operation der OpenAPI-Spec (außer `/metrics`) ist über die UI
      erreichbar; Checkliste Spec-Operation → UI-Aktion liegt im Repo
- [ ] Destruktive Aktionen nie ohne Bestätigung
- [ ] Nach Mutationen werden betroffene Queries invalidiert (kein Stale-UI)
- [ ] Rollenregeln: unerlaubte Optionen sind nicht anwählbar, Server-403
      wird trotzdem sauber angezeigt
