# Plex Exporter

Plex Exporter ist ein Webkatalog für Plex-Bibliotheken. Das Projekt besteht aus einem statischen Frontend, einem Express-/TypeScript-Backend, SQLite-Persistenz, Tautulli-Synchronisation, optionaler TMDB-Anreicherung, Admin-UI und Docker/Caddy-Deployment.

## Schnelle Orientierung

- Doku-Hub: [docs/README.md](docs/README.md)
- Lokales Setup: [docs/development/local-setup.md](docs/development/local-setup.md)
- Betrieb mit Docker Compose: [docs/operations/docker-compose.md](docs/operations/docker-compose.md)
- Architektur und Datenfluss: [docs/development/architecture.md](docs/development/architecture.md)
- Konfiguration: [docs/reference/configuration.md](docs/reference/configuration.md)
- Tests und Qualität: [docs/development/testing.md](docs/development/testing.md)
- Troubleshooting: [docs/operations/troubleshooting.md](docs/operations/troubleshooting.md)

## Was läuft wo?

- `apps/frontend/`: öffentlicher Katalog, Admin-UI-Client, esbuild-Build, statische Assets.
- `apps/backend/`: Backend-API, Admin-Routen, Scheduler, Tautulli-Sync, SQLite/Drizzle-Repositories.
- `packages/shared/`: gemeinsame Modelle, Filter- und Paging-Helfer.
- `tools/`: Doku-Checks, Serien-Splitter, Bundle-Analyse, Debug-Hilfen.
- `deploy/unraid/`: Unraid-Compose-Bundle.
- `docs/`: dauerhafte Projektdokumentation.

## Lokaler Start

```bash
npm ci
cp apps/backend/.env.example apps/backend/.env
npm run build --workspace @plex-exporter/frontend
npm run dev --workspace @plex-exporter/backend
```

Node `24.x` ist erforderlich. Der Frontend-Build ist vor dem Backend-Start nötig, weil das Backend die Admin-UI und `/dist`-Assets aus `apps/frontend/public` erwartet.

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Der Root-Compose-Stack startet `backend`, `caddy` und optional per Profil `tautulli-mock`. Caddy liefert das Frontend aus und proxyt `/api/*`, `/admin*` und `/health` zum Backend.

## Wichtige Realitäten

- Runtime: Node `>=24 <25`, npm Workspaces.
- Daten: SQLite über `better-sqlite3` und Drizzle; im Container typischerweise `/app/data/sqlite/plex-exporter.sqlite`.
- Integrationen: Tautulli für Bibliotheksdaten, TMDB für Metadaten, Resend für E-Mail-Funktionen.
- Auth: `/admin` und Admin-APIs nutzen Basic Auth, wenn `ADMIN_USERNAME` und `ADMIN_PASSWORD` gesetzt sind. `API_TOKEN` schützt die `/libraries`-Route.
- Lokale `better-sqlite3`-ABI-Probleme nach Node-Wechseln werden mit `npm ci` oder notfalls `npm rebuild better-sqlite3 --workspace @plex-exporter/backend` behoben.

## Prüfung

```bash
npm run docs:check
npm run text:check
```
