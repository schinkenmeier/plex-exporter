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

- `apps/frontend`: Portal (`public/index.html`), öffentliche Library (`public/library.html` mit `src/main.js`), Admin-App (`src/admin/main.ts`), Build (`scripts/build.mjs`), statische Dateien in `public/`.
- `apps/backend`: Prozessstart (`src/server.ts`), Runtime-Zusammenbau (`src/createServer.ts`), Env-Parsing (`src/config/index.ts`), Routen, Services, Repositories und Migrationen.
- `packages/shared`: gemeinsame Modelle und Filter-/Paging-Helfer für Frontend und Backend.
- `tools`: Doku-/Text-Checks, Serien-Splitter, Bundle-Analyse, Debug-Hilfen.

## Backend-Routen

- Öffentlich: `/health`, `/api/v1/*`, `/api/hero/:kind`, `/api/thumbnails/*`, `/api/watchlist/*`, `/api/newsletter/*`.
- Token-geschützt: `/libraries`, wenn `API_TOKEN` gesetzt ist.
- Admin-geschützt: `/admin/*`, `/admin/api/*`, `/admin/api/tautulli/*`, `/media/*`, wenn Admin-Credentials gesetzt sind. Basic Auth bleibt Standard; optional ist ein Bearer-Token über `ADMIN_API_TOKEN` möglich.

Die Admin-API wird in `apps/backend/src/routes/admin.ts` als Shell zusammengesetzt. Die fachlichen Router liegen unter `apps/backend/src/routes/admin/`:

- `overview.ts`: bündelt nur die Dashboard-Mounts.
- `systemStatus.ts`: `/admin/api/status`.
- `runtimeConfig.ts`: `/admin/api/config`.
- `stats.ts`: `/admin/api/stats`.
- `dbExplorer.ts`: `/admin/api/db/*`.
- `logs.ts`: `/admin/api/logs` mit Level-/Zeit-/Freitextfilter, `offset`/`limit` und newest-first Pagination.
- `integrations.ts`: `/admin/api/tmdb`, `/admin/api/resend/settings`, `/admin/api/test/*`, `/admin/api/diagnostics/run`.
- `legacyTautulliSettings.ts`: `/admin/api/tautulli/settings`.
- `watchlistSettings.ts`: `/admin/api/watchlist/admin-email`.
- `watchlistRequests.ts`: `/admin/api/watchlist/requests*`, Anfrage-Summary, Statuswechsel, Notizen, Reply-Mail und Reply-Templates.
- `configStatus.ts`: gemeinsame Resolver für Tautulli-/Resend-Konfigurationsstatus, kein Express-Router.

Newsletter-Flows liegen in `apps/backend/src/routes/newsletter.ts`. Der Router stellt public nur Subscribe/Unsubscribe bereit und mountet admin-geschützt Campaign-Drafts, Testversand, finalen Versand, Statistiken, Recent Media und Digest-History unter `/admin/api/newsletter/*`.

`admin.ts` stellt außerdem `/admin/api/auth/status` und `/admin/api/profile` direkt bereit. Das Profil ist aktuell ein Single-Admin-Profil aus Config und aktiver Auth-Methode, kein eigenes User-Modell.

Die Pfade bleiben bewusst kompatibel zum Frontend-Client; neue Endpunkte sollten deshalb in den spezifischsten Domain-Router statt als konkurrierende Route unter dem gemeinsamen `/admin/api`-Präfix. Admin-Routen sollen Fehler über `next(new HttpError(...))` an den zentralen Error-Handler geben, damit API-Clients den einheitlichen Envelope bekommen.

Details stehen in [../reference/interfaces.md](../reference/interfaces.md).

## Frontend-Auslieferung

- Im Docker-Compose-Betrieb liefert Caddy `apps/frontend/public` aus und proxyt Backend-Pfade.
- `/` ist das Portal. `/library` fällt explizit auf `library.html` zurück, damit direkte Aufrufe von `/library` und `/library/` den öffentlichen Medienbereich laden.
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
