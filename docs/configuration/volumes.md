# Docker Volumes & Data Persistence Guide

Dieser Guide erklärt, wie persistente Daten in Plex Exporter gespeichert werden.

## 📂 Volume-Struktur

### Entwicklung (Local)

```
plex-exporter/
└── data/                          # Wird in .gitignore ignoriert
    ├── backend/                   # Backend persistente Daten
    │   ├── sqlite/                # SQLite Datenbank
    │   │   ├── plex-exporter.sqlite
    │   │   ├── plex-exporter.sqlite-shm
    │   │   └── plex-exporter.sqlite-wal
    │   └── exports/               # Optionale JSON Exports
    └── caddy/                     # Caddy Server Daten
        ├── data/                  # Caddy internal data (z.B. SSL certs)
        └── config/                # Caddy Konfiguration
```

### Unraid

```
/mnt/user/appdata/plex-exporter/
├── backend/                       # Backend Daten
│   ├── sqlite/
│   │   └── plex-exporter.sqlite
│   └── exports/
└── caddy/                         # Caddy Daten
    ├── data/
    └── config/
```

---

## ⚙️ Konfiguration

### Über `.env` Datei

Kopiere `.env.example` nach `.env` und passe die Pfade an:

**Development (Standard):**
```bash
BACKEND_DATA_PATH=./data/backend
CADDY_DATA_PATH=./data/caddy/data
CADDY_CONFIG_PATH=./data/caddy/config
```

**Unraid:**
```bash
BACKEND_DATA_PATH=/mnt/user/appdata/plex-exporter/backend
CADDY_DATA_PATH=/mnt/user/appdata/plex-exporter/caddy/data
CADDY_CONFIG_PATH=/mnt/user/appdata/plex-exporter/caddy/config
```

**Custom Paths:**
```bash
# Absoluter Pfad auf beliebigem System
BACKEND_DATA_PATH=/path/to/your/data
CADDY_DATA_PATH=/path/to/caddy/data
CADDY_CONFIG_PATH=/path/to/caddy/config
```

---

## 🔄 Volumes vs Bind Mounts

### Was wir nutzen: **Bind Mounts**

**Vorteile:**
- ✅ Daten sind direkt auf dem Host-Dateisystem sichtbar
- ✅ Einfach zu sichern (z.B. mit Unraid CA Backup)
- ✅ Manueller Zugriff möglich (z.B. DB kopieren)
- ✅ Flexibel konfigurierbar über `.env`

**Alternative: Docker Managed Volumes**
```yaml
volumes:
  appdata:
    driver: local
```

**Nachteile:**
- ❌ Versteckt in `/var/lib/docker/volumes/`
- ❌ Schwieriger zu finden und zu verwalten
- ❌ Unraid Backup-Tools funktionieren nicht

---

## 💾 Datenbank Migration

### Von altem Volume zu neuem Bind Mount

Wenn du von Docker-managed Volumes zu Bind Mounts wechselst:

**1. Alte Daten sichern:**
```bash
# Container stoppen
docker-compose down

# Daten aus altem Volume kopieren
docker run --rm \
  -v plex-exporter_appdata:/source \
  -v $(pwd)/data/backend:/dest \
  alpine sh -c "cp -av /source/* /dest/"
```

**2. Neue Container starten:**
```bash
docker-compose up -d
```

### Von Development zu Unraid

**1. Daten komprimieren:**
```bash
tar -czf plex-exporter-data-$(date +%Y%m%d).tar.gz data/backend/
```

**2. Auf Unraid hochladen:**
```bash
scp plex-exporter-data-*.tar.gz root@<unraid-ip>:/mnt/user/appdata/plex-exporter/
```

**3. Auf Unraid entpacken:**
```bash
ssh root@<unraid-ip>
cd /mnt/user/appdata/plex-exporter/
tar -xzf plex-exporter-data-*.tar.gz
mv data/backend/* backend/
rm -rf data
```

---

## 🔍 Volume Inspection

### Daten im Container prüfen:
```bash
# Backend Daten
docker exec plex-exporter-backend-1 ls -la /app/data/

# SQLite Datenbank
docker exec plex-exporter-backend-1 ls -lh /app/data/sqlite/

# Exports
docker exec plex-exporter-backend-1 ls -la /app/data/exports/
```

### Daten auf Host prüfen:
```bash
# Development
ls -la data/backend/sqlite/
ls -la data/caddy/

# Unraid
ssh root@<unraid-ip> "ls -la /mnt/user/appdata/plex-exporter/"
```

### Docker Inspect:
```bash
# Volume Mounts anzeigen
docker inspect plex-exporter-backend-1 | grep -A 10 "Mounts"
docker inspect plex-exporter-caddy | grep -A 10 "Mounts"
```

---

## 📊 Datenbank-Größe überwachen

```bash
# Im Container
docker exec plex-exporter-backend-1 du -sh /app/data/

# Auf Host (Development)
du -sh data/backend/

# Auf Unraid
ssh root@<unraid-ip> "du -sh /mnt/user/appdata/plex-exporter/backend"
```

---

## 🗑️ Daten löschen (VORSICHT!)

### Alle Daten löschen:
```bash
# Container stoppen
docker-compose down

# Development
rm -rf data/

# Unraid
ssh root@<unraid-ip> "rm -rf /mnt/user/appdata/plex-exporter/backend/*"
```

### Nur Datenbank zurücksetzen:
```bash
# Container stoppen
docker-compose down

# Development
rm -f data/backend/sqlite/*.sqlite*

# Unraid
ssh root@<unraid-ip> "rm -f /mnt/user/appdata/plex-exporter/backend/sqlite/*.sqlite*"

# Container neu starten (erstellt leere DB)
docker-compose up -d
```

---

## 💿 Backup & Restore

### Manuelles Backup

**Development:**
```bash
# Backup erstellen
tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz data/

# Restore
tar -xzf backup-TIMESTAMP.tar.gz
```

**Unraid:**
```bash
# Via SSH
ssh root@<unraid-ip>
cd /mnt/user/appdata/plex-exporter/
tar -czf ~/backup-plex-exporter-$(date +%Y%m%d).tar.gz backend/

# Download
scp root@<unraid-ip>:~/backup-plex-exporter-*.tar.gz .
```

### Automatisches Backup (Unraid CA Backup Plugin)

Das Unraid Community Applications Backup Plugin sichert automatisch:
- `/mnt/user/appdata/plex-exporter/`

**Konfiguration:**
1. Installiere "CA Backup / Restore Appdata" aus Community Apps
2. Füge `plex-exporter` zur Backup-Liste hinzu
3. Zeitplan konfigurieren (z.B. täglich um 3 Uhr)

### Datenbank-spezifisches Backup

**SQLite Datenbank sauber sichern:**
```bash
# Hot backup (während Container läuft)
docker exec plex-exporter-backend-1 \
  sqlite3 /app/data/sqlite/plex-exporter.sqlite ".backup /app/data/backup.sqlite"

# Backup runterladen
docker cp plex-exporter-backend-1:/app/data/backup.sqlite ./backup-$(date +%Y%m%d).sqlite
```

---

## 🔒 Berechtigungen

### Linux/Unraid

Container läuft als `root` im Container, Dateien gehören `root` auf dem Host.

**Problemlösung:**
```bash
# Auf Unraid: Berechtigungen korrigieren
ssh root@<unraid-ip>
cd /mnt/user/appdata/plex-exporter/
chown -R nobody:users backend/
chmod -R 775 backend/
```

### Windows/Mac (Docker Desktop)

Docker Desktop handhabt Berechtigungen automatisch. Keine Anpassungen nötig.

---

## 🚨 Troubleshooting

### "Permission denied" beim Volume Mount

**Linux:**
```bash
# Verzeichnis erstellen mit korrekten Berechtigungen
mkdir -p data/backend data/caddy/data data/caddy/config
chmod -R 775 data/
```

**Unraid:**
```bash
ssh root@<unraid-ip>
mkdir -p /mnt/user/appdata/plex-exporter/{backend,caddy/data,caddy/config}
chown -R nobody:users /mnt/user/appdata/plex-exporter/
```

### Datenbank ist leer nach Neustart

**Prüfe ob Volume korrekt gemountet ist:**
```bash
docker inspect plex-exporter-backend-1 | grep -A 5 "Mounts"
```

**Prüfe Datenbank-Pfad:**
```bash
docker exec plex-exporter-backend-1 env | grep SQLITE_PATH
# Sollte sein: /app/data/sqlite/plex-exporter.sqlite
```

### Volumes aus altem Setup noch vorhanden

**Alte Docker Volumes auflisten:**
```bash
docker volume ls | grep plex
```

**Alte Volumes löschen (VORSICHT - Datenverlust!):**
```bash
docker volume rm plex-exporter_appdata
docker volume rm plex-exporter_caddy_data
docker volume rm plex-exporter_caddy_config
```

---

## 📖 Weiterführende Dokumentation

- [Docker Volumes Dokumentation](https://docs.docker.com/storage/volumes/)
- [Docker Bind Mounts](https://docs.docker.com/storage/bind-mounts/)
- [Unraid Docker Best Practices](https://wiki.unraid.net/Docker_Best_Practices)
- [SQLite Backup](https://www.sqlite.org/backup.html)
