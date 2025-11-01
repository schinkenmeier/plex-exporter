# Datenbankschema-Migration – Roadmap

## Ausgangslage
- Aktuelle Persistenz basiert auf `better-sqlite3` mit manuell gepflegten Tabellen (`media_metadata`, `thumbnails`, `tautulli_snapshots`, optionale Hero-Pipeline-Tabellen).
- Repositories operieren mit handgeschriebenem SQL, JSON-Spalten werden als Text gespeichert.
- Keine Benutzer-/Import-Job-Verwaltung oder Terminplanung in der Datenbank vorhanden.

## Zielbild
- Vereinheitlichtes Schema auf Basis von Drizzle ORM (SQLite-kompatibel), angelehnt an den Ansatz aus „Plex-Exporter-Pro“.
- Abdeckung zusätzlicher Domänenobjekte: Benutzer, Media-Hierarchie (Media/Seasons/Episodes), Cast-Relationen, Import-Jobs, E-Mail-Kampagnen, Import-Schedules.
- Gemeinsame Nutzung der Tabellen- und Zod-Schemata durch Backend (und perspektivisch UI) via `apps/backend/src/db/schema.ts`.

## Fortschritt (Stand 2025-10-23)
- Media-, Thumbnail- und TautulliSnapshot-Repositories wurden auf Drizzle umgestellt; Express-Routen und Tests verwenden jetzt ausschließlich die neuen ORM-basierten Repositories.
- `media_thumbnails` und `tautulli_snapshots` sind im Drizzle-Schema verankert, Legacy-Zugriffe über `better-sqlite3.prepare()` entfallen in den produktiven Pfaden.
- Legacy-Import-Skripte wurden entfernt; Tautulli-Synchronisation und API-Routen verwenden direkt die Drizzle-Repositories.
- Hero-Pipeline-Cache (`hero_pools`) wird ebenfalls über Drizzle verwaltet; vorbereitete Statements wurden durch ORM-Upserts ersetzt.
- Saison-, Episoden- und Cast-Repositories liefern relationale Daten via `/api/v1` (Seasons inkl. Episoden & Cast); damit sind die neuen Tabellen erstmals produktiv angebunden.
- Admin Dashboard visualisiert die neuen Kennzahlen (Seasons/Episodes/Cast) und kleine Serien-Samples direkt aus der Drizzle-Datenbank.
- Frontend-Detailansichten greifen bevorzugt auf `/api/v1/series/:id` zu, um Seasons, Episoden und Cast dynamisch zu laden; statische Exporte dienen nur noch als Fallback.
- `npm test` läuft grün gegen das Drizzle-Setup; Migration `006_convert_legacy_media` bleibt für Alt-Daten aktiv und entfernt verbleibende `media_metadata`/`thumbnails`-Tabellen.

## Integrationsschritte
1. **Dependency-Setup**
   - `drizzle-orm` und `drizzle-zod` installieren (`npm install` im Backend-Workspace ausführen).
   - Optional: CLI-Setup für Drizzle (z. B. `drizzle-kit`) einführen, falls Migrations automatisch generiert werden sollen.

2. **Connection-Layer**
   - Ergänzenden Drizzle-Adapter bauen (`drizzle(betterSqlite)`), der auf der bestehenden `createSqliteConnection` aufsetzt.
   - Wrapper exportieren (`db` Instanz + `schema`), damit Repositories sukzessive auf ORM umgestellt werden können.

3. **Migrationen**
   - Neue Tabellen über Drizzle-Migrations oder einmalige SQL-Skripte erstellen.
   - Bestehende Tabellen (`media_metadata`, `thumbnails`, `tautulli_snapshots`) bewerten:
     - entweder weiterverwenden und in neues Schema integrieren (z. B. `media_items` ←→ `media_metadata` Datenübernahme),
     - oder Legacy-Tabellen nach erfolgreicher Migration entfernen.
   - Reihenfolge beachten (Foreign Keys): `users` → `media_items` → `seasons` → `episodes` → `cast_members` → `media_cast` → `import_jobs`/`email_campaigns`/`import_schedules`.

4. **Repository-Refactor**
   - Schrittweise Ablösung der bisherigen Repositories hin zu Drizzle-Abfragen.
   - Mapping-Ebene bereitstellen, falls bestehende API-Response-Strukturen vorerst unverändert bleiben sollen.
   - Legacy-Felder (z. B. JSON in Strings) beim Lesen/Schreiben konvertieren, bis restliche Anwendung angepasst ist.

5. **Datenmigration**
   - Migration `006_convert_legacy_media` überführt Einträge aus `media_metadata`/`thumbnails` nach `media_items` bzw. `media_thumbnails` und entfernt die Legacy-Tabellen.
   - Optionales Skript `npm run migrate:drizzle` kopiert Stammdaten aus einer noch vorhandenen `media_metadata`-Tabelle; falls sie nicht existiert, wird die Migration übersprungen.
   - Cast-/Season-/Episode-Daten ggf. aus den Exportquellen oder Tautulli erneut aufbauen (falls derzeit nicht persistiert).

6. **Rollout & Backups**
   - Vor Migration Backup der SQLite-Datei erzeugen.
   - Nach Deployment Verifikationstests durchführen (CRUD, Import-Läufe, Admin-Funktionen).
   - Monitoring/Logging anpassen, um neue Tabellen (z. B. Import-Jobs) zu beobachten.

## Offene Punkte
- Entscheidung, ob längerfristig auf PostgreSQL gewechselt werden soll (Schema ist dafür vorbereitet).
- Festlegen, wie das Frontend die neuen Entitäten konsumiert (evtl. neue Endpoints notwendig).
- Automatisierte Tests für neue Tabellen/Repos ergänzen, sobald die Integration startet.
