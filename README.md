# Plex Exporter

Plex Exporter ist ein mehrteiliges Repository für einen webbasierten Plex-Katalog mit Admin-Oberfläche, Backend-API, Tautulli-Synchronisation und Docker-/Unraid-Betriebspfaden.

## Was das Projekt umfasst
- Ein Frontend für Katalog, Filter, Detailansichten, Watchlist und Newsletter-Flows.
- Ein Express-/TypeScript-Backend mit REST-Endpunkten, Admin-UI, Healthchecks, Rate Limiting und SQLite-Persistenz.
- Ein Shared-Package für gemeinsame Modelle und Filter-Helfer.
- Ein Tooling-Bereich für Serien-Splitting, Bundle-Analyse und Browser-Debugging.
- Deployment-Artefakte für Docker Compose, Caddy und Unraid.

## Schnellstart
### Lokale Entwicklung
1. Node `20.x` verwenden (`.nvmrc` und `package.json` sind darauf ausgelegt).
2. Abhängigkeiten installieren:
   ```bash
   npm ci
   ```
3. Frontend bauen:
   ```bash
   npm run build --workspace @plex-exporter/frontend
   ```
4. Backend konfigurieren:
   ```bash
   cp apps/backend/.env.example apps/backend/.env
   ```
5. Backend starten:
   ```bash
   npm run dev --workspace @plex-exporter/backend
   ```

### Docker Compose
1. Root-Umgebung anlegen:
   ```bash
   cp .env.example .env
   ```
2. Stack starten:
   ```bash
   docker compose up --build
   ```

### Unraid
- Siehe `deploy/unraid/` für den mitkopierbaren Deployment-Bundle-Einstieg.
- Die kanonische Betriebsdoku dazu liegt unter `docs/operations/unraid.md`.

## Repository-Überblick
- `apps/frontend/`: Katalog-Frontend und Admin-UI-Build.
- `apps/backend/`: Backend-API, Admin-Routen, Scheduler, Repositories und Services.
- `packages/shared/`: gemeinsame Modelle, Filter- und Paging-Helfer.
- `tools/`: Hilfsskripte und Browser-Debug-Utilities.
- `deploy/unraid/`: Unraid-spezifische Compose-Artefakte.
- `docs/`: dauerhafte Projektdokumentation.
- `work/`: temporäre Arbeitsdokumente wie Reviews und Migrationsnotizen.

## Dokumentation
- `docs/README.md`: zentraler Doku-Hub.
- `docs/handbook/`: Nutzung, Bedienung und Datenpflege aus Anwendersicht.
- `docs/operations/`: Deployment, Persistenz, Cloudflare, Unraid, Backups, Updates.
- `docs/development/`: lokales Setup, Architektur, Workspaces, Tests, Tooling.
- `docs/reference/`: kanonische Referenz für Pfade, Konfiguration, Env-Variablen und Oberflächen.

## Wichtige Realitäten dieses Repositories
- Das Backend liefert die gebauten Frontend-Assets aus. Für lokalen Backend-Start muss das Frontend vorher gebaut sein.
- Es gibt kein versioniertes Root-`config/` und kein versioniertes Root-`data/`. Diese Pfade entstehen je nach Laufzeitmodus erst lokal oder im Container.
- Frontend-Runtime-Konfiguration wird aus `apps/frontend/config/frontend.json(.sample)` in `apps/frontend/public/config/` kopiert.
- Der Serien-Splitter erzeugt `series_index.json` plus `details/<ratingKey>.json`.

## Weiterführende Einstiege
- `apps/frontend/README.md`
- `apps/backend/README.md`
- `packages/shared/README.md`
- `tools/README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
