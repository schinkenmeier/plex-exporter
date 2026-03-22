# Betrieb: Backups und Updates

## Backup-Prioritäten
1. SQLite-Datenbank
2. Export-/Cover-Verzeichnisse, wenn sie produktiv genutzt werden
3. Compose-/ENV-Dateien außerhalb des Repos

## Update im Root-Compose-Betrieb
1. Konfiguration sichern.
2. Neue Version auschecken.
3. Container neu bauen und starten:
   ```bash
   docker compose up --build -d
   ```
4. `health` und Admin-Zugang prüfen.

## Update im Unraid-GHCR-Betrieb
1. `IMAGE_TAG` anpassen, falls nötig.
2. Neue Images pullen.
3. Stack neu starten.
4. Healthcheck und Admin-Zugang prüfen.

## Vor jedem Update prüfen
- sind Host-Mounts vorhanden?
- ist die SQLite-Datei gesichert?
- existieren externe Dienste wie Tautulli, TMDB und Resend noch mit gültigen Zugangsdaten?
