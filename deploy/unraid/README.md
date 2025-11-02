# Plex Exporter – Unraid Deployment (Docker Compose Manager)

Dieser Ordner bündelt alle Dateien, die für den Betrieb über das Unraid Docker Compose Manager Plugin benötigt werden.

## Inhalte

- `docker-compose.yml` – Compose Stack mit Unraid-spezifischen Pfaden und Port 8342 für Caddy.
- `.env.sample` – Vorlage für Umgebungsvariablen. Vor dem Import nach `.env` kopieren und anpassen.
- `Caddyfile` – HTTP-Konfiguration für Cloudflare Zero Trust (TLS findet außerhalb von Unraid statt).

## Vorbereitung auf Unraid

1. Repository (oder zumindest den Build-relevanten Teil) nach `/boot/config/plugins/compose.manager/projects/plex-exporter/` kopieren.  
   Hinweis: Der Stack baut seine Images lokal, deshalb müssen die Quellcodes (`apps/*`, `packages/*`, etc.) verfügbar sein.
2. `.env.sample` in `.env` umbenennen und alle Passwörter/Token ausfüllen.
3. Sicherstellen, dass die Verzeichnisse in `.env` unter `/mnt/user/appdata/plex-exporter/...` existieren oder vorab erstellt werden.

## Import in das Compose Manager Plugin

1. Plugin öffnen → **Projects** → **Add** → vorhandenes Verzeichnis wählen (`plex-exporter`).
2. Kontrolle, dass `.env` erkannt wird und die Variablen passen (Port 8342, Tautulli-URL `http://192.168.178.34:8181`, API-Token, etc.).
3. Projekt starten:
   - Backend wird gebaut und als `plex-exporter-backend:local` gespeichert.
   - Caddy wird gebaut, das lokale `Caddyfile` wird beim Start per Volume eingebunden.
4. Logs prüfen (`Logs`-Tab im Plugin oder `docker logs plex-exporter-backend|plex-exporter-caddy` über SSH).
5. Funktionstest:
   - Backend-Healthcheck: `curl http://<unraid-ip>:8342/health`
   - Web-UI: `http://<unraid-ip>:8342`
   - Cloudflare Tunnel auf Port 8342 konfigurieren.

## Updates und Wartung

- Bei Codeänderungen das Repository erneut auf Unraid synchronisieren (z.B. per `git pull` oder `rsync`).
- Danach im Plugin `Rebuild` ausführen, damit die Images neu gebaut werden.
- Backups der Daten unter `/mnt/user/appdata/plex-exporter/` einplanen.

