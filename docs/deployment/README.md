# Deployment Guide: Plex Exporter auf Unraid mit GHCR

## Übersicht

Es gibt zwei Wege, den Plex Exporter auf Unraid zu deployen:

1. **Mit prebuilt Images von GHCR** (empfohlen für Production)
2. **Mit lokalem Build** (für Entwicklung/Testing)

## Option 1: Prebuilt Images von GHCR (Empfohlen)

### Voraussetzungen

- Die Images müssen in GitHub Container Registry (GHCR) veröffentlicht sein
- Du brauchst Zugriff auf das GHCR Repository

### Schritt 1: Neue Images bauen und pushen

**Lokal auf deinem Windows-Rechner:**

```bash
# 1. In das Projekt-Verzeichnis wechseln
cd C:\Users\nilsd\Documents\GitHub\plex-exporter

# 2. Backend-Image bauen
docker build -t ghcr.io/schinkenmeier/plex-exporter-backend:latest -f apps/backend/Dockerfile .

# 3. Frontend-Image bauen (mit neuem Caddyfile!)
docker build -t ghcr.io/schinkenmeier/plex-exporter-frontend:latest -f apps/frontend/Dockerfile .

# 4. Bei GHCR einloggen (falls noch nicht geschehen)
docker login ghcr.io -u schinkenmeier

# 5. Images zu GHCR pushen
docker push ghcr.io/schinkenmeier/plex-exporter-backend:latest
docker push ghcr.io/schinkenmeier/plex-exporter-frontend:latest
```

### Schritt 2: Auf Unraid deployen

**SSH auf deinen Unraid-Server:**

```bash
# 1. SSH auf Unraid
ssh root@unraid-server

# 2. Zum Projekt-Verzeichnis
cd /mnt/user/appdata/plex-exporter

# 3. Kopiere die docker-compose.images.yml und .env.sample
# (Falls noch nicht vorhanden)

# 4. Erstelle .env aus .env.sample
cp .env.sample .env
nano .env
# Fülle die Werte aus (siehe unten)

# 5. Alte Container stoppen und entfernen
docker-compose -f docker-compose.images.yml down

# 6. Neue Images pullen
docker-compose -f docker-compose.images.yml pull

# 7. Container starten
docker-compose -f docker-compose.images.yml up -d

# 8. Logs überprüfen
docker logs plex-exporter-backend --tail 50
docker logs plex-exporter-caddy --tail 50
```

### .env Konfiguration

Erstelle eine `.env` Datei mit folgenden Variablen:

```bash
# Backend
BACKEND_NODE_ENV=production
BACKEND_INTERNAL_PORT=4000
BACKEND_SQLITE_PATH=/app/data/sqlite/plex-exporter.sqlite
BACKEND_API_TOKEN=dein-sicheres-token-hier
BACKEND_ADMIN_USERNAME=admin
BACKEND_ADMIN_PASSWORD=dein-sicheres-passwort
BACKEND_TMDB_ACCESS_TOKEN=dein-tmdb-token
BACKEND_TAUTULLI_URL=http://192.168.178.34:8181
BACKEND_TAUTULLI_API_KEY=dein-tautulli-key

# Optional
BACKEND_RESEND_API_KEY=
BACKEND_RESEND_FROM_EMAIL=

# Pfade auf Unraid
BACKEND_DATA_PATH=/mnt/user/appdata/plex-exporter/backend
CADDY_DATA_PATH=/mnt/user/appdata/plex-exporter/caddy/data
CADDY_CONFIG_PATH=/mnt/user/appdata/plex-exporter/caddy/config

# Caddy Port (für Cloudflare Tunnel)
CADDY_HTTP_PORT=8342

# Image Tag (optional)
IMAGE_TAG=latest
```

## Option 2: Lokaler Build auf Unraid

Falls du die Images direkt auf Unraid bauen möchtest (z.B. für Testing):

### Voraussetzungen

- Git ist auf Unraid installiert
- Das Repository ist geklont

### Deployment-Schritte

```bash
# 1. SSH auf Unraid
ssh root@unraid-server

# 2. Repository klonen (falls noch nicht vorhanden)
cd /mnt/user/appdata
git clone https://github.com/schinkenmeier/plex-exporter.git
cd plex-exporter

# 3. Wechsel zum deploy/unraid Verzeichnis
cd deploy/unraid

# 4. Erstelle .env aus .env.sample
cp .env.sample .env
nano .env
# Fülle die Werte aus

# 5. Images bauen
docker-compose build

# 6. Container starten
docker-compose up -d

# 7. Logs überprüfen
docker logs plex-exporter-backend --tail 50
docker logs plex-exporter-caddy --tail 50
```

## Nach dem Deployment: Cloudflare Zero Trust

**Wichtig:** Nach dem Deployment musst du Cloudflare Zero Trust konfigurieren!

Siehe: [CLOUDFLARE_ZERO_TRUST_FIX.md](../../CLOUDFLARE_ZERO_TRUST_FIX.md)

### Benötigte Bypass-Pfade:

```
katalog.dinspel.eu/api/*
katalog.dinspel.eu/health
katalog.dinspel.eu/config/*
katalog.dinspel.eu/hero.policy.json
katalog.dinspel.eu/site.webmanifest
```

**Oder mit Wildcards (empfohlen):**

```
katalog.dinspel.eu/api/*
katalog.dinspel.eu/*.json
katalog.dinspel.eu/config/*
```

## Updates deployen

### Für GHCR Images:

```bash
# 1. Neue Images bauen und pushen (lokal)
docker build -t ghcr.io/schinkenmeier/plex-exporter-backend:latest -f apps/backend/Dockerfile .
docker build -t ghcr.io/schinkenmeier/plex-exporter-frontend:latest -f apps/frontend/Dockerfile .
docker push ghcr.io/schinkenmeier/plex-exporter-backend:latest
docker push ghcr.io/schinkenmeier/plex-exporter-frontend:latest

# 2. Auf Unraid pullen und neu starten
ssh root@unraid-server
cd /mnt/user/appdata/plex-exporter
docker-compose -f docker-compose.images.yml pull
docker-compose -f docker-compose.images.yml up -d
```

### Für lokalen Build:

```bash
# Auf Unraid
ssh root@unraid-server
cd /mnt/user/appdata/plex-exporter
git pull
cd deploy/unraid
docker-compose down
docker-compose build
docker-compose up -d
```

## Troubleshooting

### Container startet nicht

```bash
# Logs ansehen
docker logs plex-exporter-backend
docker logs plex-exporter-caddy

# Container Status prüfen
docker ps -a | grep plex-exporter

# Netzwerk prüfen
docker network ls | grep plex-exporter
```

### Caddyfile Mount Error

Falls du den Fehler bekommst:
```
error mounting "/mnt/user/appdata/compose.manager/projects/Caddyfile" to rootfs
```

**Lösung:** Verwende `docker-compose.images.yml` ohne die Caddyfile/Config Volume-Mounts (bereits entfernt).

Das Caddyfile ist bereits im Image gebacken!

### Frontend lädt keine Daten

1. **Prüfe Cloudflare Zero Trust Bypass** (siehe [CLOUDFLARE_ZERO_TRUST_FIX.md](../../CLOUDFLARE_ZERO_TRUST_FIX.md))
2. **Prüfe Backend-Logs:**
   ```bash
   docker logs plex-exporter-backend --tail 100
   ```
3. **Teste API direkt:**
   ```bash
   curl http://localhost:8342/api/v1/movies
   curl http://localhost:8342/health
   ```

### Config-Datei wird nicht geladen

1. **Prüfe ob das neue Image verwendet wird:**
   ```bash
   docker inspect plex-exporter-caddy | grep -A 10 "Image"
   ```
2. **Teste Config-Endpoint:**
   ```bash
   curl http://localhost:8342/config/frontend.json
   ```

   Sollte JSON zurückgeben, nicht HTML!

3. **Falls HTML zurückkommt:** Das Image hat noch das alte Caddyfile. Neues Image bauen und pushen!

## Weitere Dokumentation

- [CLOUDFLARE_ZERO_TRUST_FIX.md](../../CLOUDFLARE_ZERO_TRUST_FIX.md) - Cloudflare Konfiguration
- [CADDYFILE_FIX_CONFIG.md](../../CADDYFILE_FIX_CONFIG.md) - Caddyfile JSON-Fix
- [README.md](../../README.md) - Projekt-Dokumentation
