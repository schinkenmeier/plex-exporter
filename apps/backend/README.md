# Plex Exporter Backend

Dieses Paket stellt das Fundament für eine künftige API bereit, die Plex-Exports über HTTP verfügbar macht. Ziel ist es, vorbereitete JSON-Dumps aus `data/exports/` strukturiert auszuliefern, sie optional aufzubereiten und zukünftige Verwaltungsaufgaben (z. B. Re-Exports, Validierungen, Authentifizierung) zu übernehmen.

## Aktueller Stand
- Ein Express-Server (`src/server.ts`) mit vorbereiteten Routen und gemeinsamer Middleware-Konfiguration.
- Ein Health-Endpunkt unter `/health`, implementiert in `src/routes/health.ts`, der eine einfache Betriebsprüfung erlaubt.
- Platzhalter für automatisierte Tests (`tests/`).

## Nächste Schritte
- Anbindung an reale Exportdaten aus `data/exports/`.
- Ergänzung weiterer Routen (z. B. `/movies`, `/shows`).
- Konfiguration von Logging, Fehlerbehandlung und Authentifizierung.
- Erweiterung der Test-Suite (Unit-, Integrations- und Contract-Tests).
