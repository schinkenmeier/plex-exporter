# Oberflächen und Schnittstellen

## Öffentliche Flächen

- `/`: Katalog-Frontend im Caddy-/Frontend-Container.
- `/health`: Backend-Healthcheck.
- `/api/v1/movies`, `/api/v1/series`, `/api/v1/filter`, `/api/v1/search`, `/api/v1/recent`, `/api/v1/stats`.
- `/api/v1/tmdb/*`: TMDB-Proxy/Detaildaten, wenn konfiguriert.
- `/api/hero/:kind`: Hero-Daten.
- `/api/thumbnails/*`: lokale oder Tautulli-basierte Bilder.
- `/api/watchlist/*`: Watchlist-Mail-Hilfen.
- `/api/newsletter/subscribe`, `/api/newsletter/unsubscribe`.

## Geschützte Flächen

- `/admin`: Admin-UI.
- `/admin/api/status`, `/admin/api/config`, `/admin/api/stats`, `/admin/api/logs`, `/admin/api/db/*`.
- `/admin/api/tautulli/*`: Tautulli-Konfiguration, Library Sections, manueller Sync, Live-Stream, Schedules, Snapshots.
- `/admin/api/tmdb`, `/admin/api/resend/settings`: Integrationsstatus und gespeicherte Tokens/Settings. Env-Konfiguration bleibt jeweils aktiv und wird in Statusfeldern wie `source`, `fromEnv`, `fromDatabase` und `envOverride` sichtbar.
- `/admin/api/newsletter/*`, `/admin/api/welcome-email/*`: Mail-Betriebsfunktionen.
- `/media/*`: Basic-Auth-geschützte Medienverwaltung.
- `/libraries`: Bearer-Token-geschützt, wenn `API_TOKEN` gesetzt ist.

## Auth

- Admin- und Media-Flächen nutzen Basic Auth über `ADMIN_USERNAME` und `ADMIN_PASSWORD`.
- `/libraries` nutzt `Authorization: Bearer <API_TOKEN>`, wenn `API_TOKEN` gesetzt ist.
- Öffentliche Katalog-APIs haben Rate Limits und Cache Header, aber keine Benutzerkonten.

## Admin-UI-Bereiche

- Dashboard
- Config
- Logs
- Database
- Tautulli
- Diagnostics

## Datenfluss

```text
Tautulli -> Sync -> SQLite -> /api/v1/* -> Frontend
                    -> /admin/api/* -> Admin-UI
TMDB ----> Hero/Details
Resend --> Newsletter/Watchlist/Welcome-Mail
```

Admin-API-Clients sollten Fehler aus `message`, `error`, `error.message` oder `details` normalisieren. Bestehende Backend-Endpunkte liefern noch mehrere dieser Formen.

## Medien-URLs in `/api/v1/*`

Bildfelder wie `poster`, `backdrop`, Season-`poster` und Episode-`thumb` werden konsumierbar ausgeliefert:

- Lokal gespeicherte Cover-Pfade wie `covers/movie/123/poster.jpg` werden zu `/api/thumbnails/covers/movie/123/poster.jpg` normalisiert.
- Tautulli-Bildpfade wie `/library/metadata/123/thumb/456` werden über `/api/thumbnails/tautulli/library/metadata/123/thumb/456` ausgeliefert.
- Wenn ein Request-Host vorhanden ist, liefert `/api/v1/*` diese API-Thumbnail-Pfade als absolute Backend-URLs.

Nach einem erfolgreichen manuellen oder geplanten Tautulli-Sync werden die `/api/v1/*`-Katalog-, Detail-, Filter-, Such-, Recent- und Stats-Caches invalidiert. Cache-Keys enthalten Protocol und Host, damit absolute Medien-URLs nicht zwischen Hosts geteilt werden.
