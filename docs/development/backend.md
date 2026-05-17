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
- Tautulli-Konfiguration nutzt `tautulli_config` als kanonische Persistenz. ENV bleibt höher priorisiert; alte `tautulli.*` Settings sind nur Legacy-Fallback bzw. Kompatibilität für alte Admin-Endpunkte.
- `createRuntime(appConfig, deps)` liefert den Server-Runtime-Handle mit `dispose()`. `createServer(appConfig, deps)` bleibt als Kompatibilitätswrapper erhalten; `createServer(runtime)` gibt die Express-App der Runtime zurück.
- Tautulli-Sync, Live-Monitoring und Scheduler sind Teil des produktiven Backends, nicht nur von Dev-Tools.
- Das Drizzle-Schema beschreibt Tabellen und Relationen; historisch gewachsene Performance-Indizes liegen in den Migrationen. Neue DB-Änderungen sollen beide Ebenen bewusst prüfen.
- `media_items.library_section_id` ist aktuell eine Tautulli-Referenz ohne harte Foreign-Key-Garantie. Integritätsänderungen daran brauchen eine explizite Migration und Bestandsdatenprüfung.

## Tests
- `npm run test --workspace @plex-exporter/backend`
- `npm run test:coverage --workspace @plex-exporter/backend`
- `npm run type-check --workspace @plex-exporter/backend`
