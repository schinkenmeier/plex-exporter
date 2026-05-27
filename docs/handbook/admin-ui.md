# Admin-UI

## Zugriff

Die Admin-UI liegt unter `/admin`. Sie ist nur nutzbar, wenn `ADMIN_USERNAME` und `ADMIN_PASSWORD` gemeinsam gesetzt sind; sonst antwortet das Backend mit `503`.

## Bereiche

- Dashboard: Laufzeit-, System- und Datenbankstatus.
- Config: maskierte Laufzeitkonfiguration und gespeicherte Integrationswerte.
- Logs: gepufferte Backend-Logs.
- Database: SQLite-Tabellenansicht mit begrenzten Abfragen.
- Tautulli: Verbindung, Library Sections, manueller Sync, Live-Status, Zeitpläne, Snapshots.
- Diagnostics: Tests für Datenbank und Integrationen.

## Konfigurationslogik

- Env-Werte haben Vorrang vor DB-Werten.
- Tautulli kann per Env oder Admin-UI konfiguriert werden; gespeichert wird aktuell in `tautulli_config`.
- TMDB und Resend können ebenfalls aus Env oder gespeicherten Werten kommen.

## Siehe auch

- Konfiguration: [../reference/configuration.md](../reference/configuration.md)
- Schnittstellen: [../reference/interfaces.md](../reference/interfaces.md)
- Troubleshooting: [../operations/troubleshooting.md](../operations/troubleshooting.md)
