# Sub-Task: Rate-Limiting für Auth-Endpunkte

## Kontext
**Bei der M12-Detailplanung entdeckte Lücke**: weder
[Basic-Auth-Middleware (M2)](../../../M2-webdav-core/02-express-server-bootstrap/03-basic-auth-http-middleware.md)
noch
[Digest-](../../../M10-extended-auth/03-digest-auth-http/02-digest-response-validation.md)
noch
[OAuth2-Middleware (M10)](../../../M10-extended-auth/05-oauth2-http/01-bearer-middleware.md)
drosseln fehlgeschlagene Versuche. In-Memory, pro IP (Single-Instance-
Einschränkung wie Nonce-Store/Cron, siehe
[00-setting-goal.md](../../00-setting-goal.md)).

## Aufgabe
- `packages/server/src/http/auth-rate-limiter.middleware.ts`:
  In-Memory-Zähler (`Map<ip, { count, windowStart }>`), Sliding- oder
  Fixed-Window (z.B. 15 Minuten)
- Läuft **vor** allen drei Auth-Middlewares; bei Überschreiten eines
  Schwellwerts (Default z.B. 10 fehlgeschlagene Versuche im Fenster,
  konfigurierbar über `DAVNODE_AUTH_RATE_LIMIT_MAX`/`_WINDOW_MINUTES`)
  → `429 Too Many Requests` mit `Retry-After`-Header, **bevor** die
  eigentliche Auth-Middleware überhaupt aufgerufen wird (spart auch
  unnötige Passwort-Verifikations-Rechenzeit)
- Zähler wird bei einem **erfolgreichen** Login für diese IP
  zurückgesetzt (verhindert, dass ein legitimer Nutzer nach ein paar
  Tippfehlern dauerhaft ausgesperrt bleibt, sobald er sich korrekt
  anmeldet)
- Gilt einheitlich für Basic, Digest und OAuth2 — ein Angreifer kann das
  Limit nicht umgehen, indem er zwischen Schemes wechselt (gemeinsamer
  Zähler pro IP, nicht pro Scheme)
- Explizit **kein** Schutz vor verteilten Angriffen (viele IPs) — im
  Code kommentiert, in der Dokumentation vermerkt

## Akzeptanzkriterien
- [ ] Nach `DAVNODE_AUTH_RATE_LIMIT_MAX` fehlgeschlagenen Versuchen von
      derselben IP liefert der nächste Versuch `429` mit
      `Retry-After`
- [ ] Ein Wechsel zwischen Basic/Digest/OAuth2 von derselben IP
      umgeht das Limit **nicht** (gemeinsamer Zähler)
- [ ] Ein erfolgreicher Login setzt den Zähler für diese IP zurück
- [ ] Nach Ablauf des Zeitfensters sind wieder Versuche möglich

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 16, 25, 27
