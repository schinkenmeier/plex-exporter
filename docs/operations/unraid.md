# Betrieb: Unraid

## Rolle dieser Doku
Dies ist die kanonische Unraid-Doku. `deploy/unraid/README.md` bleibt ein kompakter Bundle-Quickstart für das Mitkopieren nach Unraid.

## Empfohlener Weg
- `deploy/unraid/docker-compose.images.yml` verwenden
- `.env.sample` nach `.env` kopieren
- im Compose Manager den Ordner `deploy/unraid/` importieren

## Wichtige Dateien
- `docker-compose.images.yml`: Pull aus GHCR
- `docker-compose.yml`: lokaler Build auf Unraid
- `.env.sample`: Unraid-spezifische Variablen
- `config/frontend.json`: Frontend-Runtime-Konfiguration

## Erwartete Pfade
- Backend-Appdata: z. B. `/mnt/user/appdata/plex-exporter/backend`
- Caddy-Daten: z. B. `/mnt/user/appdata/plex-exporter/caddy/data`
- Caddy-Konfiguration: z. B. `/mnt/user/appdata/plex-exporter/caddy/config`

## Empfohlener Ablauf
1. Deployment-Bundle nach Unraid kopieren.
2. `.env` anlegen und mindestens `IMAGE_TAG`, Datenpfade, Admin-Zugang und optionale Integrationen setzen.
3. Compose-Datei im Plugin wählen.
4. Healthcheck prüfen:
   - `http://<unraid-ip>:8342/health`

## Typische Stolperstellen
- falsche Appdata-Pfade
- fehlende GHCR-Berechtigung
- Cloudflare/Zero-Trust blockiert API-/Config-Pfade
- Verwechslung von Bundle-Quickstart und kanonischer Betriebsdoku

## Weiterführend
- `cloudflare.md`
- `backups-and-updates.md`
- `../reference/environment-variables.md`
