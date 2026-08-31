# Große Aufgabe: Lock-Evaluation

## Ziel
Eine generische Funktion, die für eine Ressource alle **wirksamen**
Locks ermittelt (direkt + von Vorfahren-Collections mit
`depth: infinity` geerbt) und prüft, ob ein neuer Lock mit bestehenden
Locks in Konflikt steht.

## Sub-Tasks
1. [collect-locks & Konflikt-Prüfung](01-collect-locks-and-conflict-check.md)

## Referenzen
- [milestones/M3-webdav-acl/03-acl-evaluation-engine/01-ace-collection-with-inheritance.md](../../M3-webdav-acl/03-acl-evaluation-engine/01-ace-collection-with-inheritance.md) — strukturelles Vorbild

## Nachtrag (Runde 20, sobald M5 existiert)
Anders als `collect-aces.ts` (M3, von Anfang an generisch über den
ACE-Tabellentyp gebaut) ist `collect-locks.ts` hier zunächst konkret auf
`collection_locks`/`file_locks` zugeschnitten. Sobald
[M5 — CardDAV](../../M5-carddav/00-setting-goal.md) existiert, wird diese
Funktion nachträglich über den Lock-Tabellentyp parametrisiert
(TypeScript-Generics, gleiches Prinzip wie in M3), damit
`addressbook_locks`/`address_object_locks` dieselbe Funktion
wiederverwenden können statt einer Kopie. Für M4 selbst ist das **kein**
Blocker — die konkrete WebDAV-Implementierung funktioniert unabhängig
davon bereits vollständig.
