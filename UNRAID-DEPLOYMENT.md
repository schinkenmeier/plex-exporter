# Unraid Deployment Guide

Deployment-Anleitung für Plex Exporter auf Unraid mit Cloudflare Zero Trust Tunnel.

## Voraussetzungen

- Unraid Server 6.9+
- Docker aktiviert
- Cloudflare Account mit Zero Trust Tunnel konfiguriert
- SSH-Zugriff auf Unraid

## Option 1: Docker Compose (Empfohlen)

### Schritt 1: Projekt auf Unraid kopieren

```bash
# Via SSH auf Unraid einloggen
ssh root@<unraid-ip>

# Appdata Verzeichnis erstellen
mkdir -p /mnt/user/appdata/plex-exporter

# Code hochladen (z.B. via git oder scp)
cd /mnt/user/appdata/plex-exporter
git clone https://github.com/yourusername/plex-exporter.git .

# Oder via scp von deinem PC:
# scp -r C:\Users\nilsd\Documents\GitHub\plex-exporter root@<unraid-ip>:/mnt/user/appdata/plex-exporter/
```

### Schritt 2: Environment Variablen konfigurieren

```bash
cd /mnt/user/appdata/plex-exporter

# .env Datei erstellen
cat > .env << 'EOF'
# Backend Configuration
BACKEND_NODE_ENV=production
BACKEND_INTERNAL_PORT=4000

# Database (wird automatisch erstellt)
BACKEND_SQLITE_PATH=/app/data/sqlite/plex-exporter.sqlite

# Optional: Admin Panel
BACKEND_ADMIN_USERNAME=admin
BACKEND_ADMIN_PASSWORD=your-secure-password

# Optional: TMDB API
BACKEND_TMDB_ACCESS_TOKEN=your-tmdb-token

# Optional: Tautulli Integration
BACKEND_TAUTULLI_URL=http://tautulli:8181
BACKEND_TAUTULLI_API_KEY=your-tautulli-api-key

# Caddy Ports
CADDY_HTTP_PORT=8080
# CADDY_HTTPS_PORT=8443  # Nicht nötig mit Cloudflare Tunnel
EOF
```

### Schritt 3: Container bauen und starten

```bash
# Unraid docker-compose verwenden
docker-compose -f docker-compose.unraid.yml up -d --build

# Oder reguläres docker-compose.yml
docker-compose up -d --build
```

### Schritt 4: Logs prüfen

```bash
# Backend logs
docker logs -f plex-exporter-backend

# Frontend/Caddy logs
docker logs -f plex-exporter-caddy

# Health check
curl http://localhost:8080/health
```

## Option 2: Portainer Stack

Falls du Portainer auf Unraid nutzt:

1. Öffne Portainer UI
2. Gehe zu **Stacks** → **Add Stack**
3. Name: `plex-exporter`
4. Kopiere den Inhalt von `docker-compose.unraid.yml`
5. Füge Environment Variables hinzu
6. Deploy Stack

## Option 3: Unraid Community App Template

### Backend Template

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>Plex-Exporter-Backend</Name>
  <Repository>plex-exporter-backend:local</Repository>
  <Registry>-</Registry>
  <Network>bridge</Network>
  <Privileged>false</Privileged>
  <Support>https://github.com/yourusername/plex-exporter</Support>
  <Project>https://github.com/yourusername/plex-exporter</Project>
  <Overview>Backend API for Plex Exporter</Overview>
  <Category>MediaApp:Other</Category>
  <WebUI></WebUI>
  <TemplateURL/>
  <Icon>https://raw.githubusercontent.com/yourusername/plex-exporter/main/apps/frontend/public/assets/Plex-Katalog-Logo.svg</Icon>
  <ExtraParams>--health-cmd="node -e \"require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\"" --health-interval=30s --health-timeout=10s --health-start-period=40s --health-retries=3</ExtraParams>
  <PostArgs></PostArgs>
  <CPUset/>
  <DateInstalled></DateInstalled>
  <DonateText/>
  <DonateLink/>
  <Requires/>
  <Config Name="Data" Target="/app/data" Default="/mnt/user/appdata/plex-exporter/data" Mode="rw" Description="Database and exports" Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/plex-exporter/data</Config>
  <Config Name="PORT" Target="PORT" Default="4000" Mode="" Description="Internal port" Type="Variable" Display="advanced" Required="false" Mask="false">4000</Config>
  <Config Name="NODE_ENV" Target="NODE_ENV" Default="production" Mode="" Description="Node environment" Type="Variable" Display="advanced" Required="false" Mask="false">production</Config>
  <Config Name="ADMIN_USERNAME" Target="ADMIN_USERNAME" Default="" Mode="" Description="Admin username" Type="Variable" Display="always" Required="false" Mask="false"/>
  <Config Name="ADMIN_PASSWORD" Target="ADMIN_PASSWORD" Default="" Mode="" Description="Admin password" Type="Variable" Display="always" Required="false" Mask="true"/>
</Container>
```

### Frontend Template

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>Plex-Exporter-Frontend</Name>
  <Repository>plex-exporter-frontend:local</Repository>
  <Registry>-</Registry>
  <Network>bridge</Network>
  <Privileged>false</Privileged>
  <Support>https://github.com/yourusername/plex-exporter</Support>
  <Project>https://github.com/yourusername/plex-exporter</Project>
  <Overview>Frontend for Plex Exporter with Caddy web server</Overview>
  <Category>MediaApp:Other</Category>
  <WebUI>http://[IP]:[PORT:8080]/</WebUI>
  <TemplateURL/>
  <Icon>https://raw.githubusercontent.com/yourusername/plex-exporter/main/apps/frontend/public/assets/Plex-Katalog-Logo.svg</Icon>
  <ExtraParams>--link plex-exporter-backend:backend</ExtraParams>
  <PostArgs></PostArgs>
  <CPUset/>
  <DateInstalled></DateInstalled>
  <DonateText/>
  <DonateLink/>
  <Requires>Plex-Exporter-Backend</Requires>
  <Config Name="HTTP Port" Target="80" Default="8080" Mode="tcp" Description="HTTP port" Type="Port" Display="always" Required="true" Mask="false">8080</Config>
  <Config Name="Caddy Data" Target="/data" Default="/mnt/user/appdata/plex-exporter/caddy/data" Mode="rw" Description="Caddy data directory" Type="Path" Display="advanced" Required="false" Mask="false">/mnt/user/appdata/plex-exporter/caddy/data</Config>
  <Config Name="Caddy Config" Target="/config" Default="/mnt/user/appdata/plex-exporter/caddy/config" Mode="rw" Description="Caddy config directory" Type="Path" Display="advanced" Required="false" Mask="false">/mnt/user/appdata/plex-exporter/caddy/config</Config>
</Container>
```

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
curl http://<unraid-ip>:8080/health
# Sollte zurückgeben: {"status":"ok",...}
```

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
docker-compose -f docker-compose.unraid.yml down
docker-compose -f docker-compose.unraid.yml up -d --build

# Oder nur Backend
docker-compose -f docker-compose.unraid.yml up -d --build backend

# Oder nur Frontend
docker-compose -f docker-compose.unraid.yml up -d --build caddy
```

## Troubleshooting

### Container starten nicht
```bash
# Logs prüfen
docker logs plex-exporter-backend
docker logs plex-exporter-caddy

# Ports prüfen
netstat -tulpn | grep :8080
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
