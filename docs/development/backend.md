# Entwicklung: Backend

## Einstiegspunkte
- `src/server.ts`: Prozessstart
- `src/createServer.ts`: Serverzusammenbau
- `src/config/index.ts`: ENV-Parsing und Konfigurationsobjekt

## Hauptbereiche
- `src/routes/`: API-, Admin- und Sync-Routen
- `src/routes/admin.ts`: Admin-Shell für UI-Auslieferung, Auth-Status, Admin-Profil und Router-Mounts
- `src/routes/admin/`: fachliche Admin-Router für Status, Config, Stats, DB-Explorer, Logs, Integrationen/Diagnostics, Tautulli-Legacy-Settings und Watchlist-Settings/Requests
- `src/repositories/`: Datenzugriff auf SQLite/Drizzle
- `src/services/`: Hero-Pipeline, Tautulli, Scheduler, Mail, Logging
- `src/db/`: Datenbank- und Migrationsschicht

## Relevante technische Punkte
- Das Backend bindet die Admin-UI im Standardmodus `ADMIN_UI_MODE=embedded` nur ein, wenn das Frontend vorher gebaut wurde. `ADMIN_UI_MODE=api-only` startet die API-Flächen ohne Admin-HTML und `/dist`.
- Admin-Routen sollen Fehler per `HttpError` an den zentralen Error-Handler weitergeben, damit der API-Envelope `{ error, meta }` konsistent bleibt.
- Neue oder geänderte Admin-Mutationsrouten sollen additiv `success: true` plus das betroffene Payload-Objekt liefern, damit alte Consumer nicht brechen und neue UI-Clients sauber typisieren können.
- Admin-Logs werden über `GET /admin/api/logs` newest-first, filterbar und paginiert ausgeliefert. Neue Log-Parameter sollen in `apps/frontend/src/admin/core/api.ts` typisiert werden.
- Batch-Diagnosen laufen über `POST /admin/api/diagnostics/run`; einzelne historische Test-Endpunkte unter `/admin/api/test/*` bleiben für Kompatibilität bestehen.
- Watchlist-Anfragen werden als Paket in `watchlist_requests.items` gespeichert. Item-Level-Status ist bewusst noch nicht eingeführt und braucht bei Bedarf eine eigene Migration.
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
