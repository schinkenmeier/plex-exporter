# Betrieb: Docker Compose

## Zweck
Die Root-`docker-compose.yml` ist der Standardpfad für einen lokalen oder selbst gehosteten Containerbetrieb außerhalb von Unraid-GHCR-Spezialfällen.

## Enthaltene Services
- `backend`: Express-API, Admin-Routen, Scheduler, SQLite-Zugriff
- `caddy`: Frontend-Auslieferung und Reverse Proxy auf das Backend
- `tautulli-mock`: optionales Profil für Entwicklung und Tests

## Start
1. `.env` aus `.env.example` erzeugen.
2. Pfade und Zugangsdaten setzen.
3. Stack starten:
   ```bash
   docker compose up --build
   ```

## Was Compose technisch tut
- mappt Root-`.env` auf Backend-ENV-Variablen
- mountet ein Host-Verzeichnis nach `/app/data`
- wartet mit `caddy` auf einen erfolgreichen Backend-Healthcheck
- exponiert HTTP/HTTPS-Ports über den Caddy-Container

## Wichtige Unterschiede zum lokalen Source-Run
- im Container ist der Datenwurzelpfad `/app/data`
- die SQLite-Datei liegt typischerweise unter `/app/data/sqlite/plex-exporter.sqlite`
- Export-/Cover-Dateien liegen typischerweise unter `/app/data/exports`

## Weiterführend
- Pfadmatrix: `../reference/runtime-paths.md`
- Persistenz: `persistence.md`
- Variablenreferenz: `../reference/environment-variables.md`
