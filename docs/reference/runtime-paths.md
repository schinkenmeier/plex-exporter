# Referenz: Runtime-Pfade

## Grundsatz
Dieses Repository hat bewusst keine versionierten Root-Verzeichnisse `config/` oder `data/` als feste Projektbestandteile. Je nach Laufzeitmodus entstehen unterschiedliche reale Pfade.

## Frontend-Konfiguration
| Zweck | Versionierter Pfad | Laufzeitpfad |
| --- | --- | --- |
| Frontend-Config-Template | `apps/frontend/config/frontend.json.sample` | n/a |
| erzeugte Runtime-Konfiguration | n/a | `apps/frontend/public/config/frontend.json` |
| erzeugtes Beispiel in `public/` | n/a | `apps/frontend/public/config/frontend.json.sample` |

## Lokaler Source-Run
| Zweck | Pfad |
| --- | --- |
| Backend-ENV | `apps/backend/.env` |
| SQLite-Default | `data/sqlite/plex-exporter.sqlite` |
| Exportsuche | `data/exports` |

## Docker-Compose-Betrieb
| Zweck | Host | Container |
| --- | --- | --- |
| Backend-Datenwurzel | `BACKEND_DATA_PATH` | `/app/data` |
| SQLite | `<BACKEND_DATA_PATH>/sqlite/plex-exporter.sqlite` | `/app/data/sqlite/plex-exporter.sqlite` |
| Exporte/Covers | `<BACKEND_DATA_PATH>/exports` | `/app/data/exports` |
| Caddy-Daten | `CADDY_DATA_PATH` | `/data` |
| Caddy-Konfiguration | `CADDY_CONFIG_PATH` | `/config` |

## Unraid
Unraid folgt demselben Container-Modell wie Docker Compose, nutzt aber typischerweise absolute Appdata-Pfade unter `/mnt/user/appdata/plex-exporter/...`.

## Hero-Policy
- versioniert: `apps/frontend/public/hero.policy.json`
- optionaler Backend-Override: `HERO_POLICY_PATH`
