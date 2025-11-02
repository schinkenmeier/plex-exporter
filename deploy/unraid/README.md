# Plex Exporter – Unraid Deployment (Docker Compose Manager)

Kompakte Anleitung für den Betrieb über das Unraid Docker Compose Manager Plugin. Fokus: Pull fertiger Images aus GHCR, kein lokaler Build nötig.

## Inhalte

- `docker-compose.images.yml` – Pullt Images aus GHCR: `ghcr.io/schinkenmeier/plex-exporter-backend` und `ghcr.io/schinkenmeier/plex-exporter-frontend`.
- `docker-compose.yml` – Alternative für lokalen Build (nur nutzen, wenn du wirklich auf Unraid bauen willst).
- `.env.sample` – Vorlage für Umgebungsvariablen; nach `.env` kopieren und anpassen.
- `Caddyfile` – HTTP-Konfiguration für Cloudflare Zero Trust (TLS extern, ohne HSTS).
- `config/frontend.json` – Default-Frontend-Konfiguration, wird ins Container-Image gemountet.

## Quick Start (empfohlen: GHCR‑Images)

1) Dateien auf Unraid bereitstellen
- Diesen Ordner `deploy/unraid/` nach Unraid kopieren, z.B. nach `/boot/config/plugins/compose.manager/projects/plex-exporter/`.
- `.env.sample` → `.env` kopieren und anpassen:
  - `IMAGE_TAG=latest` (oder eine Version wie `v0.1.0`)
  - `BACKEND_TAUTULLI_URL=http://192.168.178.34:8181`
  - Passwörter/Token (API/Admin)
  - Appdata‑Pfade unter `/mnt/user/appdata/plex-exporter/...`
- Optional `config/frontend.json` anpassen (Startansicht, Theme, etc.). Datei wird automatisch eingebunden.

2) Projekt im Compose Manager importieren
- Plugin → Projects → Add → Pfad: der Ordner mit dieser README (`deploy/unraid`).
- Compose‑Datei: `docker-compose.images.yml` auswählen (kein Build).
- Starten.

3) Testen
- Web: `http://<unraid-ip>:8342`
- Health: `http://<unraid-ip>:8342/health`
- Cloudflare Tunnel auf Host‑Port `8342` routen.
- Hinweis: Caddy liefert nur HTTP; der Tunnel liefert später TLS. Falls dein Browser bereits per HSTS auf HTTPS umleitet, lösche den HSTS-Eintrag (Chrome: `chrome://net-internals/#hsts`) oder nutze direkt die Tunnel-URL.

## Details zur Images‑Variante

- Tags: `latest` (Push auf main) oder versionierte Tags wie `v0.1.0` (Release‑Tag).
- In `.env` steuerst du mit `IMAGE_TAG`, welche Version gezogen wird.
- Service‑Order: `caddy` wartet via `depends_on: service_healthy` auf ein gesundes Backend (Healthcheck aktiv im Compose).

## Alternative: Lokaler Build auf Unraid

- Nur wenn du das komplette Repo kopieren willst und auf Unraid bauen möchtest.
- Compose‑Datei: `docker-compose.yml` (baut Backend + Frontend lokal).
- Voraussetzung: Genug Speicher/CPU auf Unraid; Build läuft in Docker, nicht im Host.

## Updates & Wartung

- Neue Version: `IMAGE_TAG` in `.env` aktualisieren und im Plugin `Pull`/`Up` ausführen.
- Logs: `docker logs -f plex-exporter-backend` und `docker logs -f plex-exporter-caddy`.
- Backup: `/mnt/user/appdata/plex-exporter/` in dein Appdata‑Backup einbeziehen.
