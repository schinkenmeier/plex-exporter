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
