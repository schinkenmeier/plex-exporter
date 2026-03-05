# Plex Exporter Backend

Express/TypeScript-Backend fuer den Plex Exporter. Die API liefert Katalogdaten aus SQLite und stellt zusaetzliche Endpunkte (Hero, Thumbnails, Watchlist, Admin) bereit.

## Voraussetzungen

- Node.js `20.x` (gleich wie CI)
- npm `10+`
- Gebautes Frontend-Bundle (`npm run build --workspace @plex-exporter/frontend`), da das Backend die Admin-UI ausliefert

## Schnellstart (lokal)

1. Abhaengigkeiten installieren:
   ```bash
   npm ci
   ```
2. Backend-ENV anlegen:
   ```bash
   cp apps/backend/.env.example apps/backend/.env
   ```
3. Frontend-Bundle bauen (erforderlich fuer Backend-Start):
   ```bash
   npm run build --workspace @plex-exporter/frontend
   ```
4. Backend starten:
   ```bash
   npm run dev --workspace @plex-exporter/backend
   ```

## API-Uebersicht

### Public

- `GET /health`
- `GET /api/v1/stats`
- `GET /api/v1/movies`
- `GET /api/v1/movies/:id`
- `GET /api/v1/series`
- `GET /api/v1/series/:id`
- `GET /api/v1/filter`
- `GET /api/v1/search?q=...`
- `GET /api/v1/recent`
- `GET /api/v1/tmdb/:type/:id` (nur mit TMDB-Token nutzbar)
- `GET /api/v1/tmdb/tv/:id/season/:seasonNumber`
- `GET /api/hero/:kind`
- `GET /api/thumbnails/*`
- `POST/GET /api/watchlist/*`
- `POST/GET /api/welcome-email/*`
- `POST/GET /api/newsletter/*`

### Geschuetzt

- `GET /libraries` (Bearer/X-API-Key, wenn `API_TOKEN` gesetzt ist)
- `GET /media/*` (Basic Auth)
- `GET /admin/*` (Basic Auth)
- `GET/POST /admin/api/tautulli/*` (Basic Auth)

## Wichtige Umgebungsvariablen

Siehe `apps/backend/.env.example`.

- `PORT` (Default `4000`)
- `SQLITE_PATH` (Default relativ zu `apps/backend`: `../../data/sqlite/plex-exporter.sqlite`)
- `API_TOKEN` (optional)
- `ADMIN_USERNAME` + `ADMIN_PASSWORD` (optional, aber gemeinsam)
- `TAUTULLI_URL` + `TAUTULLI_API_KEY` (optional, aber gemeinsam)
- `TMDB_ACCESS_TOKEN` (optional)
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (optional, aber gemeinsam)

## Node-/Native-Module-Hinweis

`better-sqlite3` ist ein natives Modul und muss zur aktiven Node-Version passen.

- Empfohlen: Node `20.x` verwenden (`.nvmrc` im Repo-Root)
- Nach Node-Wechsel immer neu installieren/rebuilden:
  ```bash
  npm ci
  npm rebuild better-sqlite3 --workspace @plex-exporter/backend
  ```

Wenn Tests mit einem Binary-Mismatch fehlschlagen, ist das fast immer ein Umgebungsproblem (Node-Version vs. kompiliertes Native-Binary), kein Codefehler.

## Docker Compose

Fuer Container-Setups werden Variablen ueber die Root-Datei `.env` (Vorlage: `.env.example`) gesetzt und in `docker-compose.yml` auf Backend-ENV gemappt.
