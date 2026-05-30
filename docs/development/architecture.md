# Architektur und Datenfluss

## Systembild

```text
Tautulli -> TautulliSyncService -> SQLite/Drizzle -> Repositories -> Express-Routen -> Frontend/Admin-UI
                         |              |
                         |              +-> Hero-Pipeline, TMDB, Thumbnails
                         +-> Scheduler, Live-Monitor, Snapshots
```

Plex Exporter ist kein reiner JSON-Exporter mehr. Der produktive Katalog wird aus SQLite gelesen und über Backend-Routen ausgeliefert.

## Bausteine

- `apps/frontend`: öffentlicher Katalog (`src/main.js`), Admin-App (`src/admin/main.ts`), Build (`scripts/build.mjs`), statische Dateien in `public/`.
- `apps/backend`: Prozessstart (`src/server.ts`), Runtime-Zusammenbau (`src/createServer.ts`), Env-Parsing (`src/config/index.ts`), Routen, Services, Repositories und Migrationen.
- `packages/shared`: gemeinsame Modelle und Filter-/Paging-Helfer für Frontend und Backend.
- `tools`: Doku-/Text-Checks, Serien-Splitter, Bundle-Analyse, Debug-Hilfen.

## Backend-Routen

- Öffentlich: `/health`, `/api/v1/*`, `/api/hero/:kind`, `/api/thumbnails/*`, `/api/watchlist/*`, `/api/newsletter/*`.
- Token-geschützt: `/libraries`, wenn `API_TOKEN` gesetzt ist.
- Basic-Auth-geschützt: `/admin/*`, `/admin/api/*`, `/admin/api/tautulli/*`, `/media/*`, wenn Admin-Credentials gesetzt sind.

Die Admin-API wird in `apps/backend/src/routes/admin.ts` als Shell zusammengesetzt. Die fachlichen Router liegen unter `apps/backend/src/routes/admin/`: Overview (`/admin/api/status`, `/config`, `/stats`), DB-Explorer (`/admin/api/db/*`), Logs, Integrationen (`/tmdb`, `/resend/settings`, `/test/*`), Legacy-Tautulli-Settings (`/admin/api/tautulli/settings`) und Watchlist-Settings. Die Pfade bleiben bewusst kompatibel zum Frontend-Client; neue Endpunkte sollten deshalb in den spezifischsten Domain-Router statt als konkurrierende Route unter dem gemeinsamen `/admin/api`-Präfix.

Details stehen in [../reference/interfaces.md](../reference/interfaces.md).

## Frontend-Auslieferung

- Im Docker-Compose-Betrieb liefert Caddy `apps/frontend/public` aus und proxyt Backend-Pfade.
- Das Backend liefert `/admin`, statische Admin-Dateien und `/dist` aus `apps/frontend/public`.
- Darum muss vor einem lokalen Backend-Start der Frontend-Build laufen.

## Persistenz

- SQLite-Datei und Rate-Limit-Datenbank liegen unter dem konfigurierten SQLite-Verzeichnis.
- Cover, Thumbnails und exportnahe Artefakte liegen unter einem `exports`-Pfad.
- Pfade unterscheiden sich zwischen Source-Run, Docker Compose und Unraid. Siehe [../reference/runtime-paths.md](../reference/runtime-paths.md).

## Integrationen

- Tautulli ist die Hauptquelle für Bibliotheken, Metadaten und Bilder.
- TMDB kann zusätzliche Metadaten für Detail- und Hero-Daten liefern.
- Resend aktiviert Newsletter-, Watchlist- und Welcome-Mail-Flows.
- Admin-UI-Werte können in SQLite gespeichert werden; Env-Werte haben Vorrang.
- Runtime-Änderungen aus der Admin-UI werden in den betroffenen Services neu verdrahtet. TMDB aktualisiert V1-TMDB-Routen, Hero-Pipeline, Sync-Enrichment und den TMDB-Cache; Resend aktualisiert die Mail-Sender.
