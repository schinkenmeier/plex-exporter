# Oberflächen und Schnittstellen

## Öffentliche Flächen

- `/`: Portal/Landingpage mit Einstieg in Library und Admin-Bereich.
- `/library`: öffentliche Medien-Library im Caddy-/Frontend-Container.
- `/health`: Backend-Healthcheck.
- `/api/v1/movies`, `/api/v1/series`, `/api/v1/filter`, `/api/v1/search`, `/api/v1/recent`, `/api/v1/stats`.
- `/api/v1/tmdb/*`: TMDB-Proxy/Detaildaten, wenn konfiguriert.
- `/api/hero/:kind`: Hero-Daten.
- `/api/thumbnails/*`: lokale oder Tautulli-basierte Bilder.
- `/api/watchlist/*`: Watchlist-Mail-Hilfen.
- `/api/newsletter/subscribe`, `/api/newsletter/unsubscribe`.

## Geschützte Flächen

- `/admin`: Admin-UI.
- `/admin/api/status`, `/admin/api/config`, `/admin/api/stats`, `/admin/api/profile`, `/admin/api/logs`, `/admin/api/database/*`.
- `/admin/api/tautulli/*`: Tautulli-Konfiguration, Library Sections, manueller Sync, Live-Stream, Schedules, Snapshots.
- `/admin/api/tmdb`, `/admin/api/resend/settings`, `/admin/api/test/*`, `/admin/api/diagnostics/run`: Integrationsstatus, Einzeltests und Batch-Diagnosen. Env-Konfiguration bleibt jeweils aktiv und wird in Statusfeldern wie `source`, `fromEnv`, `fromDatabase` und `envOverride` sichtbar; gespeicherte DB-Werte werden separat über `saved` gemeldet.
- `/admin/api/watchlist/*`: Watchlist-Settings, Anfrage-Lifecycle, Anfrage-Summary, Reply-Templates und Admin-Antworten.
- `/admin/api/newsletter/*`, `/admin/api/welcome-email/*`: Mail-Betriebsfunktionen inklusive Newsletter-Campaign-Drafts, Testversand, Send und Digest-History.
- `/media/*`: Admin-geschützte Medienverwaltung.
- `/libraries`: Bearer-Token-geschützt, wenn `API_TOKEN` gesetzt ist.

## Auth

- Admin- und Media-Flächen nutzen Basic Auth über `ADMIN_USERNAME` und `ADMIN_PASSWORD`; optional akzeptieren sie zusätzlich `Authorization: Bearer <ADMIN_API_TOKEN>`.
- `/admin/api/auth/status` meldet die aktive Admin-Authentifizierung für API-Clients.
- `/admin/api/profile` liefert daraus abgeleitete minimale Admin-Metadaten wie Name, Rolle, Auth-Methode und Initialen.
- `/libraries` nutzt `Authorization: Bearer <API_TOKEN>`, wenn `API_TOKEN` gesetzt ist.
- Öffentliche Katalog-APIs haben Rate Limits und Cache Header, aber keine Benutzerkonten.
- Öffentliche Mail-Flächen wie Newsletter-Subscribe/Unsubscribe und Watchlist-Senden haben ein eigenes, engeres Public-Mail-Rate-Limit.
- Das Portal auf `/` authentifiziert nicht und ruft keine Auth-API auf. Es verlinkt nur auf `/library` und `/admin`.

## Admin-UI-Bereiche

- Dashboard
- Config
- Logs
- Database
- Tautulli
- Diagnostics
- Watchlist Requests
- Newsletter Campaigns

## Admin-API-Hinweise

- `GET /admin/api/logs` liefert gepufferte Backend-Logs newest-first. Unterstützt werden `level`, `since`, `limit`, `offset` und `q`; `q` sucht in Message und Context. Die Antwort enthält `logs`, `stats` und `pagination`.
- Der Datenbank-Explorer liegt unter `/admin/api/database/*`:
  - `GET /admin/api/database/tables` liefert `{ success: true, data: { tables } }` für allowlisted Tabellen mit `name`, `label`, `category`, `description` und `rowCount`.
  - `GET /admin/api/database/tables/:table/schema` liefert Tabellenmetadaten, Spalten, Primary-Key-Spalten, Sensitivity und Capabilities (`selectable`, `sortable`, `searchable`, `filterable`, `rangeFilterable`, `enumSafe`).
  - `POST /admin/api/database/tables/:table/rows/query` akzeptiert `columns`, `pagination`, `sort`, `search` und `filters[]` (`equals`, `null`, `range`) und liefert Rows mit Zellmetadaten, Pagination und angewendeten Parametern.
  - `GET /admin/api/database/tables/:table/filter-options` liefert nur enum-sichere Filterwerte.
- Der Explorer ist read-only und nutzt eine strenge Allowlist. Nicht freigegebene oder unbekannte Tabellen liefern `404`; gesperrte Spalten in Query, Sort, Search oder Filter liefern `400`. Sensible Werte werden nicht roh ausgeliefert, und es gibt keinen Reveal-Endpoint.
- Die alten `/admin/api/db/tables` und `/admin/api/db/query` Endpunkte antworten mit `410 Gone` und `replacement: "/admin/api/database"`.
- `POST /admin/api/diagnostics/run` akzeptiert `{ checks: ["database", "tautulli", "tmdb", "resend"] }` und liefert pro Check `key`, `success`, `message`, `durationMs` und `checkedAt`.
- Watchlist-Anfragen werden beim Public-Submit persistiert und über `/admin/api/watchlist/requests` verwaltet. Dazu gehören `GET /requests/summary`, Statuswechsel mit optionaler Message, Admin-Notizen, Reply-Mail und feste Reply-Templates unter `/reply-templates`.
- Newsletter-Campaigns liegen unter `/admin/api/newsletter/campaigns`. Unterstützt werden Liste, Detail, Create, Draft-only Patch/Delete, Testversand und Send. Public bleiben nur Subscribe/Unsubscribe.
- Newsletter-Campaign-Statuswerte sind `draft`, `sending`, `sent` und `failed`; Empfängerstatuswerte sind `pending`, `sent` und `failed`.
- `POST /admin/api/newsletter/campaigns` erwartet `subject`, `body`, optional `mediaType` (`movie`, `tv` oder `null`) und optional `mediaItemIds`. `PATCH` akzeptiert dieselben Felder partiell, aber nur solange die Campaign `draft` ist.
- `POST /admin/api/newsletter/campaigns/:id/test` akzeptiert `email` oder `emails[]` und verändert den Campaign-Status nicht. `POST /admin/api/newsletter/campaigns/:id/send` löst den Versand an aktive Subscriptions aus, schreibt Recipient-Status und Campaign-Zähler und erzeugt weiterhin einen Legacy-Digest-Eintrag.
- `GET /admin/api/newsletter/campaigns` unterstützt `status`, `limit` und `offset` und liefert eine Pagination-Struktur mit `total`, `limit`, `offset` und `hasMore`.
- Tautulli-Mutationsrouten für Library Sections und Sync-Schedules liefern bei Erfolg additiv `success: true` plus `section` bzw. `schedule`.

## Datenfluss

```text
Tautulli -> Sync -> SQLite -> /api/v1/* -> Frontend
                    -> /admin/api/* -> Admin-UI
TMDB ----> Hero/Details/Sync-Enrichment
Resend --> Newsletter/Watchlist/Welcome-Mail
```

Neue Backend-Fehlerantworten verwenden den Envelope `{ error: { message, statusCode, details? }, meta: { timestamp, path, method } }`. Admin-API-Clients sollten vorerst weiter alte Formen aus `message`, `error`, `error.message` oder `details` normalisieren.

Die modularisierten Admin-Router unter `apps/backend/src/routes/admin/` geben neue Fehler über `HttpError` an den zentralen Error-Handler weiter. Dadurch liefern insbesondere DB-Explorer, Integrationsdiagnosen, Runtime-Stats, Legacy-Tautulli-Settings und Watchlist-Settings den Envelope, statt eigene `{ error: ... }`-Formen zu erzeugen.

## Integrationsstatus

Tautulli, TMDB und Resend können aus Env oder gespeicherten DB-Werten kommen. Env ist immer aktiv, wenn vollständig gesetzt. Gespeicherte Werte bleiben trotzdem erhalten und können über die Admin-API gelöscht werden.

- Aktive Quelle: `source`, `fromEnv`, `fromDatabase`, `envOverride`.
- Gespeicherte Werte: `saved`.
- TMDB-Änderungen wirken ohne Neustart auf `/api/v1/tmdb/*`, Hero-Pipeline und Tautulli-Sync-Enrichment.
- Resend-Änderungen wirken ohne Neustart auf Newsletter-, Watchlist- und Welcome-Mail-Sender.

## Medien-URLs in `/api/v1/*`

Bildfelder wie `poster`, `backdrop`, Season-`poster` und Episode-`thumb` werden konsumierbar ausgeliefert:

- Lokal gespeicherte Cover-Pfade wie `covers/movie/123/poster.jpg` werden zu `/api/thumbnails/covers/movie/123/poster.jpg` normalisiert.
- Tautulli-Bildpfade wie `/library/metadata/123/thumb/456` werden über `/api/thumbnails/tautulli/library/metadata/123/thumb/456` ausgeliefert.
- Wenn ein Request-Host vorhanden ist, liefert `/api/v1/*` diese API-Thumbnail-Pfade als absolute Backend-URLs.
- Der Tautulli-Thumbnail-Proxy braucht keinen lokalen `exports`-Pfad. Nur lokale Cover-/Movie-/Series-Dateien hängen vom `exports`-Pfad ab.

## Library-API für das User-UI-Redesign

Die Public-Media-Antworten liefern additiv `writers`, `languages`, `originalLanguage`, `trailerYoutubeId`, `trailerSite`, `trailerName` und `trailerUrl`. `languages` und Trailer stammen aus TMDB-Enrichment und beschreiben Metadaten, nicht garantiert die tatsächlich vorhandenen Plex-Audio- oder Untertitelspuren.

`GET /api/v1/filter` unterstützt zusätzlich `studio`, `language` und `sortBy=rating`. Die Suche umfasst neben Titel und Summary auch Studio, Genres, Collections, Directors, Writers und Sprachfelder. Die Filterantwort enthält globale, filterunabhängige und kurz gecachte `facets` mit `genres`, `years`, `collections`, `studios` und `languages`.

`GET /api/v1/stats` behält `totalMovies`, `totalSeries` und `totalItems` bei und ergänzt `totalRuntime`, `totalEpisodes`, `newItems`, `movies` und `series` für die geplante Library-Statistikleiste.

## API-Caches

Nach einem erfolgreichen manuellen oder geplanten Tautulli-Sync werden die `/api/v1/*`-Katalog-, Detail-, Filter-, Such-, Recent- und Stats-Caches invalidiert. Cache-Keys enthalten Protocol und Host, damit absolute Medien-URLs nicht zwischen Hosts geteilt werden.

Fehlerantworten werden nicht gecached. Der TMDB-Cache wird geleert, wenn TMDB-Konfiguration über die Admin-API gespeichert oder gelöscht wird.
