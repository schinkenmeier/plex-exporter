# Entwicklung: Backend

## Einstiegspunkte
- `src/server.ts`: Prozessstart
- `src/createServer.ts`: Serverzusammenbau
- `src/config/index.ts`: ENV-Parsing und Konfigurationsobjekt

## Hauptbereiche
- `src/routes/`: API-, Admin- und Sync-Routen
- `src/repositories/`: Datenzugriff auf SQLite/Drizzle
- `src/services/`: Hero-Pipeline, Tautulli, Scheduler, Mail, Logging
- `src/db/`: Datenbank- und Migrationsschicht

## Relevante technische Punkte
- Das Backend bindet die Admin-UI nur ein, wenn das Frontend vorher gebaut wurde.
- Einige Konfigurationen können aus der Datenbank kommen, ENV-Werte haben aber Vorrang.
- Tautulli-Sync, Live-Monitoring und Scheduler sind Teil des produktiven Backends, nicht nur von Dev-Tools.

## Tests
- `npm run test --workspace @plex-exporter/backend`
- `npm run test:coverage --workspace @plex-exporter/backend`
