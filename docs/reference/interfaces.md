# Referenz: Oberflächen und Schnittstellen

## Öffentliche Flächen
- `/`: Katalog-Frontend
- `/health`: Healthcheck
- `/api/v1/*`: Katalog-API
- `/api/hero/:kind`: Hero-Endpunkte
- `/api/thumbnails/*`: Bild- und Thumbnail-Auslieferung
- `/api/watchlist/*`, `/api/welcome-email/*`, `/api/newsletter/*`

## Geschützte Flächen
- `/admin/*`: Admin-Oberfläche und zugehörige API
- `/admin/api/tautulli/*`: Tautulli-Konfiguration, Sync, Schedules, Snapshots
- `/libraries`: token-geschützte Bibliotheksabfrage, wenn konfiguriert
- `/media/*`: Basic-Auth-geschützte Medien-Endpunkte

## Admin-UI-Bereiche
- Dashboard
- Config
- Logs
- Database
- Tautulli
- Diagnostics

## Datenfluss auf hoher Ebene
Tautulli -> Sync-Service -> SQLite -> Repositories -> `/api/*` -> Frontend/Admin-UI

## Hinweis zur Detailtiefe
Diese Referenz dokumentiert die Oberflächen nur auf hoher Ebene. Die technische Architektur steht unter `../development/architecture.md`.
