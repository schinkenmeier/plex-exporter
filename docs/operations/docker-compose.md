# Docker Compose

## Rolle

Die Root-[docker-compose.yml](../../docker-compose.yml) ist der Standardpfad für lokalen oder selbst gehosteten Containerbetrieb. Für Unraid mit fertigen Registry-Images siehe [unraid.md](unraid.md).

## Services

- `backend`: Express-API, Admin-Routen, Scheduler, SQLite, Tautulli-Sync.
- `caddy`: statisches Frontend und Reverse Proxy auf das Backend.
- `tautulli-mock`: optionales Profil für Entwicklung und Tests.

## Start

```bash
cp .env.example .env
docker compose up --build
```

Relevante Root-Variablen stehen in [../reference/environment-variables.md](../reference/environment-variables.md).

## Routing

Caddy liefert `/` als Portal und `/library` als öffentliche Library aus dem Frontend-Image und proxyt:

- `/api/*`
- `/admin*`
- `/health`

JSON-Konfigurationen wie `/config/frontend.json` werden direkt als statische Dateien ausgeliefert.

## Persistenz

- `BACKEND_DATA_PATH` wird nach `/app/data` gemountet.
- SQLite liegt typischerweise unter `/app/data/sqlite/plex-exporter.sqlite`.
- Export-/Cover-Dateien liegen typischerweise unter `/app/data/exports`.
- Caddy nutzt eigene Mounts für `/data` und `/config`.

Details stehen in [persistence.md](persistence.md) und [../reference/runtime-paths.md](../reference/runtime-paths.md).

## Unterschiede zum Source-Run

- Container bauen Node-24-Abhängigkeiten selbst; lokale `node_modules` sind irrelevant.
- Backend und Frontend laufen getrennt: Caddy liefert Portal und Library, Backend liefert API/Admin.
- Der Backend-Container enthält bereits den Frontend- und Backend-Build.
