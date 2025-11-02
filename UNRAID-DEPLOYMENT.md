# Unraid Deployment Guide

Diese Anleitung fasst die Bereitstellung auf Unraid zusammen. Für den täglichen Betrieb und die „Single Source of Truth“ nutze bitte die kompakte Anleitung unter `deploy/unraid/README.md`.

## Voraussetzungen

- Unraid Server 6.9+
- Docker aktiviert
- Cloudflare Account mit Zero Trust Tunnel konfiguriert
- SSH-Zugriff auf Unraid

## Docker Compose Manager (Empfohlen)

Schnellstart (GHCR‑Images, kein Build auf Unraid):

1. `deploy/unraid/` nach Unraid kopieren und `.env` aus `.env.sample` erstellen.
2. Im Compose Manager die Datei `docker-compose.images.yml` wählen.
3. `IMAGE_TAG` setzen (z.B. `latest` oder `v0.1.0`) und Stack starten.
4. Test: `http://<unraid-ip>:8342/health`.

Siehe auch: `deploy/unraid/README.md` für alle Details.

### Schritt 1: Projektstruktur vorbereiten

```bash
# Via SSH auf Unraid einloggen
ssh root@<unraid-ip>

# Ablageort für Compose Manager Projekte
mkdir -p /boot/config/plugins/compose.manager/projects/plex-exporter

# Repository z.B. per git klonen oder via scp hochladen
cd /boot/config/plugins/compose.manager/projects/plex-exporter
git clone https://github.com/yourusername/plex-exporter.git .
```

> Alternativ kannst du das Repository lokal bauen und dann mit `scp -r` nach Unraid kopieren.  
> Wichtig: Für den Image-Build müssen die Unterordner `apps/`, `packages/` etc. vorhanden sein.

### Schritt 2: Environment Variablen setzen

```bash
cd deploy/unraid
cp .env.sample .env
nano .env
```

Relevante Werte:

- `BACKEND_API_TOKEN`, `BACKEND_ADMIN_PASSWORD`, `BACKEND_TAUTULLI_API_KEY`
- `BACKEND_TAUTULLI_URL=http://192.168.178.34:8181`
- `CADDY_HTTP_PORT=8342`
- Appdata-Pfade unter `/mnt/user/appdata/plex-exporter/...`

### Schritt 3: Projekt im Plugin importieren

1. Docker Compose Manager öffnen → **Projects** → **Add**.
2. Pfad `.../plex-exporter/deploy/unraid` auswählen (dort liegt `docker-compose.yml`).
3. Überprüfen, ob `.env` geladen wurde.
4. Projekt starten (`Up`).

### Schritt 4: Funktionstest

```bash
# Backend-Logs
docker logs -f plex-exporter-backend

# Caddy-Logs
docker logs -f plex-exporter-caddy

# Health Check (Port 8342)
curl http://<unraid-ip>:8342/health
```

## Alternative: Portainer Stack

1. Portainer UI öffnen → **Stacks** → **Add Stack**.
2. Inhalt aus `deploy/unraid/docker-compose.yml` kopieren.
3. `.env`-Inhalt im **Environment Variables**-Tab pflegen.
4. Stack deployen.

## Hinweis zu Community App Templates

Falls du weiterhin xml-Templates verwendest, orientiere dich an den obigen Variablen (HTTP-Port 8342, Tautulli-URL) und passe bestehende Vorlagen entsprechend an.

## Cloudflare Zero Trust Tunnel Setup

### Schritt 1: Tunnel in Cloudflare Dashboard erstellen

1. Gehe zu **Zero Trust** → **Networks** → **Tunnels**
2. Erstelle neuen Tunnel: `plex-exporter-tunnel`
3. Installiere cloudflared auf Unraid (siehe unten)

### Schritt 2: Cloudflared auf Unraid

**Via Docker (empfohlen):**

```bash
# cloudflared container starten
docker run -d \
  --name cloudflared \
  --restart unless-stopped \
  --network plex-exporter \
  -v /mnt/user/appdata/cloudflared:/etc/cloudflared \
  cloudflare/cloudflared:latest \
  tunnel --no-autoupdate run --token <YOUR_TUNNEL_TOKEN>
```

**Oder via Unraid Community App:**
- Suche nach "Cloudflared" in Community Applications
- Installiere und konfiguriere mit deinem Tunnel Token

### Schritt 3: Tunnel Routing konfigurieren

In Cloudflare Dashboard unter Tunnel → Public Hostname:

- **Subdomain:** `plex` (oder beliebig)
- **Domain:** `yourdomain.com`
- **Service:** `http://plex-exporter-caddy:80`
- **Additional settings:**
  - TLS: `No TLS Verify` (da internes HTTP)
  - HTTP/2: Aktiviert

### Alternative: config.yml

Erstelle `/mnt/user/appdata/cloudflared/config.yml`:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /etc/cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: plex.yourdomain.com
    service: http://plex-exporter-caddy:80
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      http2Origin: true

  - service: http_status:404
```

Starte cloudflared neu:
```bash
docker restart cloudflared
```

## Zugriff testen

### Lokal (Unraid Netzwerk)
```bash
curl http://<unraid-ip>:8342/health
# Sollte zurückgeben: {"status":"ok",...}
```

Hinweis: In der Images‑Variante wartet `caddy` automatisch, bis das Backend gesund ist (`depends_on: service_healthy`).

### Alternative: Einsatz vorgefertigter Images (GHCR)

Möchtest du den lokalen Build vermeiden, kannst du vorgefertigte Images aus einer Registry (z.B. GitHub Container Registry) verwenden:

- Nutze die Datei `deploy/unraid/docker-compose.images.yml` anstelle von `docker-compose.yml`.
- Setze `IMAGE_TAG` in `deploy/unraid/.env` (z.B. `latest` oder eine Version `v1.2.3`).
- Ersetze die Platzhalter `ghcr.io/<owner>/...` durch deinen tatsächlichen Namespace (Owner/Organisation).

Siehe auch die GitHub Actions Workflow-Datei `.github/workflows/docker-images.yml`, die Images für `backend` und `frontend` nach GHCR baut und pusht (Tags: `latest` auf `main`, Semver-Tags und SHA-Tags).

### Über Cloudflare Tunnel
```
https://plex.yourdomain.com/health
```

## Backup

Unraid CA Backup Plugin wird automatisch sichern:
- `/mnt/user/appdata/plex-exporter/data/` - Datenbank & Exports
- `/mnt/user/appdata/plex-exporter/caddy/` - Caddy Config

**Manuelles Backup:**
```bash
tar -czf plex-exporter-backup-$(date +%Y%m%d).tar.gz \
  /mnt/user/appdata/plex-exporter/
```

## Updates

```bash
cd /mnt/user/appdata/plex-exporter

# Code aktualisieren
git pull

# Container neu bauen
docker compose -f deploy/unraid/docker-compose.yml down
docker compose -f deploy/unraid/docker-compose.yml up -d --build

# Oder nur Backend
docker compose -f deploy/unraid/docker-compose.yml up -d --build backend

# Oder nur Frontend
docker compose -f deploy/unraid/docker-compose.yml up -d --build caddy
```

## Troubleshooting

### Container starten nicht
```bash
# Logs prüfen
docker logs plex-exporter-backend
docker logs plex-exporter-caddy

# Ports prüfen
netstat -tulpn | grep :8342
```

### Datenbank Zugriff
```bash
# In Backend Container einloggen
docker exec -it plex-exporter-backend sh

# Datenbank prüfen
ls -la /app/data/sqlite/
```

### Cloudflare Tunnel verbindet nicht
```bash
# Cloudflared logs
docker logs cloudflared

# Prüfe ob Caddy erreichbar ist
docker exec cloudflared ping plex-exporter-caddy
```

## Netzwerk Diagramm

```
Internet
   ↓
Cloudflare (HTTPS)
   ↓
Cloudflare Tunnel (cloudflared Container)
   ↓
Unraid Docker Network: plex-exporter
   ↓
plex-exporter-caddy:80 (HTTP)
   ↓
   ├─ Frontend: /
   └─ Reverse Proxy: /api/* → plex-exporter-backend:4000
```

## Sicherheitshinweise

1. **Keine Port-Freigaben nötig** - Cloudflare Tunnel macht das
2. **Admin Passwort setzen** - In .env Datei
3. **API Token optional** - Für geschützte Endpoints
4. **Cloudflare Access** - Zusätzliche Authentifizierung vor der App
5. **SQLite Berechtigungen** - Automatisch von Container gesetzt

## Performance Optimierung

### Unraid spezifisch:
```bash
# Docker image auf Cache SSD legen (falls vorhanden)
# Settings → Docker → Enable docker image on cache: Yes

# Appdata auf Cache
# /mnt/user/appdata sollte automatisch auf Cache sein
```

### Caddy Tuning:
Bereits optimiert in Caddyfile:
- HTTP/2 aktiviert
- Gzip/Zstd Compression
- Aggressive Asset Caching (1 Jahr)

## Support

- GitHub Issues: https://github.com/yourusername/plex-exporter/issues
- Unraid Forum: [Link zu Forum Thread]
