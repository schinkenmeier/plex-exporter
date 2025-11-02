# Troubleshooting Guide

Häufige Probleme und deren Lösungen beim Deployment von Plex Exporter.

## Frontend lädt keine Daten

### Symptome
- Frontend zeigt "Plex-Katalog lädt..."
- Keine Filme/Serien werden angezeigt
- Browser-Konsole zeigt Fehler

### Ursachen & Lösungen

#### 1. Cloudflare Zero Trust blockiert API-Anfragen

**Prüfen:**
```bash
# Test von außen
curl https://katalog.dinspel.eu/api/v1/movies

# Erwartet: JSON mit Filmen
# Problem: HTML mit Cloudflare-Login
```

**Lösung:** Siehe [Cloudflare Setup Guide](./cloudflare-setup.md) - API-Pfade müssen im Bypass sein.

#### 2. Backend ist nicht erreichbar

**Prüfen:**
```bash
# Auf dem Server (Unraid)
curl http://localhost:8342/health

# Docker-Logs prüfen
docker logs plex-exporter-backend --tail 50
docker logs plex-exporter-caddy --tail 50
```

**Lösung:**
- Backend-Container läuft nicht → `docker-compose up -d`
- Backend crasht beim Start → Logs prüfen, fehlende ENV-Variablen?
- Port 8342 nicht erreichbar → Firewall/Port-Forwarding prüfen

#### 3. Caddy proxied nicht richtig

**Prüfen:**
```bash
# Direkt am Backend-Container
docker exec plex-exporter-backend curl http://localhost:4000/health

# Über Caddy
curl http://localhost:80/health  # Im Caddy-Container
```

**Lösung:**
- Caddyfile fehlt JSON-Handler → Siehe [Caddyfile Fix](../../CADDYFILE_FIX_CONFIG.md)
- Backend-Service-Name falsch → Muss `backend:4000` im Caddyfile sein

---

## HTTP 520 Fehler bei Bildern

### Symptome
```
Failed to load resource: the server responded with a status of 520
/api/thumbnails/covers/movie/12345/poster.jpg
```

### Ursache
Cloudflare Zero Trust blockiert `/api/thumbnails/*` Pfade.

### Lösung
1. Füge `/api/thumbnails/*` zur Cloudflare Bypass-Liste hinzu
2. **ODER** verwende `/api/*` als Wildcard
3. Warte 2-3 Minuten
4. Browser-Cache leeren

**Test:**
```bash
curl https://katalog.dinspel.eu/api/thumbnails/covers/movie/123/poster.jpg
# Sollte ein Bild zurückgeben, nicht HTML
```

---

## Config-Datei wird nicht geladen

### Symptome
```
[main] Failed to load frontend config, using defaults
Konfiguration konnte nicht geladen werden
```

### Ursache 1: Cloudflare blockiert `/config/*`

**Prüfen:**
```bash
curl https://katalog.dinspel.eu/config/frontend.json
# Erwartet: {"startView": "movies", "lang": "de-DE"}
# Problem: HTML-Seite oder Redirect
```

**Lösung:** Füge `/config/*` zur Cloudflare Bypass-Liste hinzu.

### Ursache 2: Caddyfile serviert HTML statt JSON

**Prüfen:**
```bash
# Im Browser öffnen
https://katalog.dinspel.eu/config/frontend.json
# Zeigt: HTML-Seite mit "Plex-Katalog" Header
```

**Lösung:** Caddyfile braucht JSON-Handler **vor** dem SPA-Fallback.

Siehe: [Caddyfile Fix Documentation](../../CADDYFILE_FIX_CONFIG.md)

**Fix bereits im aktuellen Caddyfile:**
```caddy
# Serve JSON config files directly (before SPA fallback)
handle /config/*.json {
    file_server
}
```

Falls nicht vorhanden: Image neu bauen und deployen.

---

## Docker Container startet nicht

### Symptom: Caddyfile Mount Error

```
Error: error mounting "/mnt/user/appdata/compose.manager/projects/Caddyfile"
to rootfs at "/etc/caddy/Caddyfile": not a directory
```

**Ursache:** `docker-compose.yml` versucht ein Caddyfile zu mounten, das nicht existiert.

**Lösung:** Verwende `docker-compose.images.yml` **ohne** Volume-Mounts:

```yaml
volumes:
  - ${CADDY_DATA_PATH}:/data
  - ${CADDY_CONFIG_PATH}:/config
  # NOTE: Caddyfile ist bereits im Image, NICHT mounten!
  # - ./Caddyfile:/etc/caddy/Caddyfile:ro  # ← Diese Zeile entfernen/auskommentieren
```

---

## Backend: "Failed to resolve base path"

### Symptome
```
[thumbnails] Failed to resolve base path: Could not find exports directory
```

### Ursache
Backend findet das `/app/data/exports` Verzeichnis nicht.

### Lösung

**Option 1: Verzeichnis automatisch erstellen lassen**

Das Backend erstellt das Verzeichnis beim ersten Start. Stelle sicher, dass:
```bash
# Volume ist korrekt gemountet
docker inspect plex-exporter-backend | grep -A 10 "Mounts"

# Sollte zeigen:
# Source: /mnt/user/appdata/plex-exporter/backend
# Destination: /app/data
```

**Option 2: Manuell erstellen**

```bash
# Auf Unraid
mkdir -p /mnt/user/appdata/plex-exporter/backend/exports
mkdir -p /mnt/user/appdata/plex-exporter/backend/sqlite
```

---

## Datenbank ist leer nach Neustart

### Ursache 1: Volume nicht persistent

**Prüfen:**
```bash
docker inspect plex-exporter-backend | grep -A 5 "Mounts"
```

**Sollte zeigen:**
```
"Source": "/mnt/user/appdata/plex-exporter/backend",
"Destination": "/app/data",
```

**Nicht:** `"Type": "volume"` (Docker-managed Volume)

**Lösung:** Verwende Bind Mounts mit `.env` Konfiguration:
```bash
BACKEND_DATA_PATH=/mnt/user/appdata/plex-exporter/backend
```

### Ursache 2: Falscher `SQLITE_PATH`

**Prüfen:**
```bash
docker exec plex-exporter-backend env | grep SQLITE_PATH
# Sollte sein: /app/data/sqlite/plex-exporter.sqlite
```

**Lösung:** In `.env` setzen:
```bash
BACKEND_SQLITE_PATH=/app/data/sqlite/plex-exporter.sqlite
```

---

## CORS-Fehler im Frontend

### Symptome
```
Access to fetch at 'http://localhost:4000/api/v1/movies' from origin
'http://localhost:3000' has been blocked by CORS policy
```

### Ursache
Nur bei lokaler Entwicklung relevant. Backend muss CORS für Frontend-Dev-Server erlauben.

### Lösung
**Backend erlaubt bereits CORS:**
```typescript
// apps/backend/src/routes/thumbnails.ts
res.setHeader('Access-Control-Allow-Origin', '*');
```

**Falls Problem weiterhin besteht:**
1. Prüfe ob Backend läuft: `curl http://localhost:4000/health`
2. Prüfe Browser-Konsole für genaue CORS-Fehler
3. Verwende Produktions-Setup (kein CORS-Problem, da alles über Caddy läuft)

---

## Images können nicht von GHCR gepullt werden

### Symptom
```
Error response from daemon: Get "https://ghcr.io/v2/": denied
```

### Ursache
Nicht bei GHCR authentifiziert.

### Lösung

**1. GitHub Personal Access Token erstellen:**
- [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
- Scope: `read:packages`

**2. Bei GHCR einloggen:**
```bash
echo YOUR_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

**3. Images pullen:**
```bash
docker-compose -f docker-compose.images.yml pull
docker-compose -f docker-compose.images.yml up -d
```

---

## Docker Compose: "version is obsolete"

### Symptom
```
WARN: the attribute `version` is obsolete
```

### Ursache
Docker Compose v2 benötigt keine `version`-Zeile mehr.

### Lösung
**Bereits behoben** in aktuellen Dateien. Falls du die Warnung noch siehst:

```yaml
# Entferne diese Zeile:
version: "3.8"

# Starte direkt mit:
services:
  backend:
    ...
```

---

## Health-Check schlägt fehl

### Symptome
```
docker ps
# Shows: (unhealthy)
```

### Prüfen
```bash
# Manueller Health-Check
docker exec plex-exporter-backend curl http://localhost:4000/health

# Logs prüfen
docker logs plex-exporter-backend --tail 50
```

### Häufige Ursachen

**Backend läuft auf falschem Port:**
```bash
# Prüfe ENV
docker exec plex-exporter-backend env | grep PORT
# Sollte sein: PORT=4000
```

**Backend crashed beim Start:**
```bash
# Logs prüfen
docker logs plex-exporter-backend
# Suche nach: "Error", "ECONNREFUSED", "SQLITE"
```

**Health-Check-Timeout zu kurz:**

In `docker-compose.yml`:
```yaml
healthcheck:
  start_period: 40s  # Backend braucht Zeit zum Starten
  timeout: 10s
```

---

## Performance-Probleme

### Frontend lädt langsam

**Ursachen:**
1. Große Bibliothek (>5000 Titel) → Pagination nutzen
2. Viele Bilder gleichzeitig laden → Browser limitiert Connections
3. Cloudflare Rate-Limiting → Warte kurz

**Optimierungen:**
- Lazy-Loading für Bilder (bereits implementiert)
- Pagination (bereits implementiert)
- CDN/Caching (über Cloudflare automatisch)

### Backend antwortet langsam

**Prüfen:**
```bash
time curl http://localhost:8342/api/v1/movies
# Sollte <1 Sekunde sein für erste 50 Einträge
```

**Ursachen:**
- SQLite Datenbank zu groß → Indizes fehlen?
- Zu viele JOIN-Operationen → DB-Schema optimieren
- Keine Caching → Server hat wenig RAM

---

## Weitere Hilfe

**Dokumentation:**
- [Cloudflare Setup](./cloudflare-setup.md)
- [Unraid Deployment Guide](./unraid-guide.md)
- [Volumes & Data Persistence](../configuration/volumes.md)

**Logs sammeln:**
```bash
# Alle relevanten Logs
docker logs plex-exporter-backend --tail 100 > backend.log
docker logs plex-exporter-caddy --tail 100 > caddy.log
docker-compose ps > containers.log

# Als Archiv
tar -czf plex-exporter-logs-$(date +%Y%m%d).tar.gz *.log
```

**GitHub Issues:**
Falls dein Problem nicht hier gelistet ist, erstelle ein Issue:
[github.com/schinkenmeier/plex-exporter/issues](https://github.com/schinkenmeier/plex-exporter/issues)
