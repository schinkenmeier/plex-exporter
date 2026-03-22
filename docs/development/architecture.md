# Entwicklung: Architektur

## Systembild
Plex Exporter besteht aus einem Frontend-Workspace, einem Backend-Workspace, einem Shared-Package und einem Tooling-Bereich. Der produktive Datenfluss endet nicht bei Exportdateien, sondern läuft primär über SQLite und die `/api/*`-Schicht.

## Laufzeitkette
Tautulli -> Sync-Service -> SQLite/Drizzle -> Repositories -> Express-Routen -> Frontend/Admin-UI

## Frontend
- öffentlicher Katalog in `apps/frontend/src/main.js`
- Admin-Oberfläche in `apps/frontend/src/admin/`
- Hero-, Filter-, Grid-, Modal- und Watchlist-Module
- Runtime-Konfiguration aus `/config/frontend.json`

## Backend
- Serveraufbau in `src/createServer.ts`
- Public-, Protected- und Admin-Routen
- Admin-API für Status, Config, Logs, Datenbank, Tautulli, Mail und Diagnose
- Scheduler und Live-Monitor für Tautulli-Sync

## Gekoppelte Stellen
- Das Backend startet nur mit vorhandenen Frontend-Build-Artefakten.
- Das Shared-Package liefert gemeinsame Modelle und Filter-Helfer für beide Seiten.
- Bild- und Exportpfade unterscheiden sich je nach Startmodus; Source-Run und Containerbetrieb sind nicht identisch.

## Persistenz
- Source-Run: typischerweise `data/sqlite` und `data/exports`
- Container: `/app/data/sqlite` und `/app/data/exports`

## Was bewusst nicht in dieses Dokument gehört
- exakte Env-Tabellen
- Betriebsanleitungen
- Quickstarts für Nutzer

Dafür siehe `docs/reference/` und `docs/operations/`.
