# Erste Inbetriebnahme

## Empfohlene Modi

- Docker Compose: schnellster vollständiger Betrieb mit Frontend, Backend und Caddy.
- Unraid: Compose-Bundle unter [../../deploy/unraid/](../../deploy/unraid/), Details in [../operations/unraid.md](../operations/unraid.md).
- Lokaler Source-Run: Entwicklung am Backend/Frontend, siehe [../development/local-setup.md](../development/local-setup.md).

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Danach:

- Katalog: `http://localhost`
- Admin: `http://localhost/admin`
- Health: `http://localhost/health`

## Lokaler Source-Run

```bash
npm ci
cp apps/backend/.env.example apps/backend/.env
npm run build --workspace @plex-exporter/frontend
npm run dev --workspace @plex-exporter/backend
```

Danach:

- Backend/API/Admin: `http://localhost:4000`
- Admin: `http://localhost:4000/admin`
- Health: `http://localhost:4000/health`

Für den vollständigen Katalog mit statischem Frontend ist Docker/Caddy der dokumentierte Betriebsweg.

## Zuerst konfigurieren

- Admin-Zugang: `ADMIN_USERNAME` und `ADMIN_PASSWORD`
- SQLite-Pfad oder Daten-Mount
- optional Tautulli für Import
- optional TMDB für Metadaten
- optional Resend für Mail-Funktionen

Variablen stehen in [../reference/environment-variables.md](../reference/environment-variables.md), Pfade in [../reference/runtime-paths.md](../reference/runtime-paths.md).
