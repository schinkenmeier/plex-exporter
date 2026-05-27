# Runtime-Pfade

## Grundsatz

Es gibt kein versioniertes Root-`data/` oder Root-`config/` als feste Projektstruktur. Diese Pfade entstehen je nach Laufzeitmodus lokal, im Container oder unter einem Host-Mount.

## Lokaler Source-Run

| Zweck | Pfad |
| --- | --- |
| Backend-Env | `apps/backend/.env` |
| SQLite-Default | `data/sqlite/plex-exporter.sqlite` |
| Rate-Limit-DB | neben der SQLite-Datei als `rate-limit.sqlite` |
| Frontend-Build | `apps/frontend/public/dist` |
| Frontend-Runtime-Config | `apps/frontend/public/config/frontend.json` |
| Hero-Policy | `apps/frontend/public/hero.policy.json` oder `HERO_POLICY_PATH` |

## Docker Compose

| Zweck | Host | Container |
| --- | --- | --- |
| Backend-Datenwurzel | `BACKEND_DATA_PATH` | `/app/data` |
| SQLite | `<BACKEND_DATA_PATH>/sqlite/plex-exporter.sqlite` | `/app/data/sqlite/plex-exporter.sqlite` |
| Exporte/Covers | `<BACKEND_DATA_PATH>/exports` | `/app/data/exports` |
| Caddy-Daten | `CADDY_DATA_PATH` | `/data` |
| Caddy-Konfiguration | `CADDY_CONFIG_PATH` | `/config` |

## Unraid

Unraid folgt demselben Container-Modell, nutzt aber typischerweise:

- Backend: `/mnt/user/appdata/plex-exporter/backend`
- Caddy-Daten: `/mnt/user/appdata/plex-exporter/caddy/data`
- Caddy-Konfiguration: `/mnt/user/appdata/plex-exporter/caddy/config`

Siehe [../operations/unraid.md](../operations/unraid.md).
