# Sub-Task: MS-Author-Via-Header & OPTIONS-Audit

## Kontext
Bekannte, gut dokumentierte Windows-Mini-Redirector-Eigenheit: ohne den
`MS-Author-Via: DAV`-Response-Header auf `OPTIONS`-Antworten bietet
Windows Explorer eine WebDAV-Freigabe teils nur eingeschränkt oder gar
nicht zur Bearbeitung an (fällt auf reinen Lesezugriff zurück oder
verweigert das Öffnen).

## Aufgabe
- `OPTIONS`-Antwort (aus dem Server-Grundgerüst, M2) um
  `MS-Author-Via: DAV` ergänzen
- Audit der bestehenden `OPTIONS`-Antwort: `DAV`-Header muss `1, 2`
  enthalten (Class 1 + Class 2, seit M2/M4 vollständig unterstützt —
  reine Verifikation, keine neue Funktionalität), `Allow`-Header muss
  alle tatsächlich unterstützten Methoden auflisten (inkl. `PROPFIND`,
  `PROPPATCH`, `MKCOL`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`, `REPORT`,
  `ACL`, `MKCALENDAR` — je nach Pfad-Kontext)
- Manueller Test mit einer echten Windows-Installation (oder einer VM):
  WebDAV-Netzlaufwerk verbinden, Datei per Explorer öffnen/bearbeiten/
  speichern

## Akzeptanzkriterien
- [ ] `OPTIONS`-Antwort enthält `MS-Author-Via: DAV`
- [ ] `DAV`-Header enthält `1, 2`
- [ ] Manueller Test: Windows Explorer verbindet erfolgreich, eine
      Datei lässt sich öffnen, bearbeiten und speichern (Lock/Unlock
      läuft dabei sichtbar korrekt, siehe M4)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — Client-Kompatibilität-Abschnitt

## Nachtrag (bei der Umsetzung festgestellt)
Entgegen der Annahme im Kontext gab es **keine** eigene `OPTIONS`-
Antwort aus M2: kein Milestone hatte `OPTIONS` implementiert, es gab nur
Expresss automatische `Allow`-Antwort ohne `DAV`-Header. Das war auch für
CalDAV/CardDAV-Clients relevant (sie erkennen den Server an
`calendar-access`/`addressbook` im `DAV`-Header). `OPTIONS` wurde daher
hier komplett nachgerüstet (`options.route.ts`): pro Baum
(`files`/`calendars`/`addressbooks`/`principals`) die tatsächlich
implementierten Methoden in `Allow`, die passenden Compliance-Tokens in
`DAV`, dazu `MS-Author-Via: DAV`. Der manuelle Windows-Test bleibt offen.
