# Benutzerhandbuch: Admin-Oberfläche

## Zugriff
- Die Admin-Oberfläche liegt unter `/admin`.
- Sie ist per Basic Auth geschützt und benötigt `ADMIN_USERNAME` und `ADMIN_PASSWORD`.

## Bereiche der Admin-UI
- Dashboard: Status, Laufzeit, Speicher- und Datenbankkennzahlen
- Config: Konfigurationen und gespeicherte Werte für TMDB, Resend, Watchlist-E-Mail und weitere Betriebsdaten
- Logs: gepufferte Laufzeitlogs
- Database: Tabellen-Explorer für SQLite
- Tautulli: Verbindungsprüfung, Bibliotheksauswahl, manueller Sync, Zeitpläne, Snapshots
- Diagnostics: Tests für zentrale Integrationen

## Wichtige Betriebslogik
- Einige Werte können über die Admin-UI in der Datenbank gespeichert werden.
- Umgebungsvariablen haben Vorrang vor gespeicherten DB-Werten.
- Änderungen an Tautulli, TMDB oder Resend wirken je nach Bereich sofort oder nach Neuinitialisierung.

## Wann diese Oberfläche gedacht ist
- für Betrieb und Fehlersuche
- für produktionsnahe Konfiguration
- nicht als Ersatz für lokale Entwicklerwerkzeuge

## Weiterführend
- Konfigurationsmodell: `../reference/configuration.md`
- Schnittstellen und Oberflächen: `../reference/interfaces.md`
