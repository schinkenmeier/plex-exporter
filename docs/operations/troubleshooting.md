# Betrieb: Troubleshooting

## Backend ist unhealthy
- `docker logs` prüfen
- Port und Health-Endpunkt prüfen
- SQLite-Pfad und Mount prüfen

## Frontend liefert HTML statt JSON
- Caddy-/Cloudflare-Regeln prüfen
- sicherstellen, dass `/config/*.json` und andere JSON-Dateien nicht im SPA-Fallback landen

## Keine Daten im Katalog
- Datenbank leer oder Sync nie gelaufen
- Tautulli nicht konfiguriert oder Bibliotheksabschnitte nicht ausgewählt
- Admin-UI prüfen: Dashboard, Tautulli, Diagnostics

## Bilder fehlen
- Export-/Cover-Pfade fehlen
- `/api/thumbnails/*` ist extern blockiert
- Container hat keinen Zugriff auf den Daten-Mount

## GHCR-Images lassen sich nicht ziehen
- Registry-Login und Berechtigungen prüfen
- richtigen Owner/Tag verwenden

## Weitere Referenzen
- `docker-compose.md`
- `cloudflare.md`
- `unraid.md`
- `../reference/runtime-paths.md`
