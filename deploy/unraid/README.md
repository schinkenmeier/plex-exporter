# Unraid Quickstart Bundle

Dieser Ordner ist für den praktischen Einsatz auf Unraid gedacht. Die ausführliche, kanonische Doku dazu steht in `docs/operations/unraid.md`.

## Inhalt dieses Ordners
- `docker-compose.images.yml`: bevorzugter Betrieb mit GHCR-Images.
- `docker-compose.yml`: lokaler Build auf Unraid, nur bei echtem Bedarf.
- `.env.sample`: Vorlage für Umgebungsvariablen.
- `Caddyfile`: HTTP-Konfiguration für den Frontend-Container.
- `config/frontend.json`: Beispiel für Frontend-Runtime-Konfiguration.

## Empfohlener Ablauf
1. Diesen Ordner nach Unraid kopieren.
2. `.env.sample` nach `.env` kopieren und Werte anpassen.
3. Im Compose Manager `docker-compose.images.yml` verwenden.
4. Stack starten und `http://<unraid-ip>:8342/health` prüfen.

## Siehe auch
- `../../docs/operations/unraid.md`
- `../../docs/operations/cloudflare.md`
- `../../docs/reference/environment-variables.md`
