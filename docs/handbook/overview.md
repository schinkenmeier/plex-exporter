# Überblick

Plex Exporter stellt einen webbasierten Plex-Katalog mit Admin-Oberfläche bereit. Die laufende Anwendung besteht aus statischem Frontend, Backend-API, SQLite-Datenbank und optionalen Integrationen.

## Sichtbare Flächen

- `/`: öffentlicher Katalog im Caddy-/Frontend-Betrieb.
- `/admin`: geschützte Admin-UI.
- `/health`: Backend-Healthcheck.
- `/api/v1/*`: Katalogdaten für das Frontend.

## Kernfunktionen

- Filme und Serien anzeigen, filtern, suchen und sortieren.
- Detailansichten mit Metadaten, Cast, Staffeln und Episoden.
- Hero-Bereich für Highlights.
- Browser-lokale Watchlist.
- Optionale Newsletter-, Watchlist- und Welcome-Mail-Flows.
- Admin-UI für Status, Konfiguration, Logs, Datenbankansicht, Tautulli-Sync und Diagnosen.

## Datenquellen

- Tautulli ist der normale Importpfad für Bibliotheksdaten.
- SQLite ist die aktive Persistenz für Katalog- und Betriebsdaten.
- TMDB kann Metadaten ergänzen.
- Resend wird nur für Mail-Funktionen benötigt.

## Weiter

- Erste Schritte: [getting-started.md](getting-started.md)
- Daten und Sync: [data-and-sync.md](data-and-sync.md)
- Admin-UI: [admin-ui.md](admin-ui.md)
- Architektur: [../development/architecture.md](../development/architecture.md)
