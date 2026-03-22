# Benutzerhandbuch: Erste Inbetriebnahme

## Geeigneten Betriebsmodus wählen
- Für schnelle lokale Nutzung oder Tests: Docker Compose
- Für Unraid: `deploy/unraid/` plus `../operations/unraid.md`
- Für Entwicklung: `../development/local-setup.md`

## Docker Compose in Kurzform
1. Root-`.env` aus `.env.example` erzeugen.
2. Wichtige Werte setzen:
   - Datenpfade
   - Admin-Zugang
   - optional Tautulli-, TMDB- und Resend-Zugang
3. Stack starten:
   ```bash
   docker compose up --build
   ```
4. Öffnen:
   - Katalog: `http://localhost`
   - Health: `http://localhost/health`

## Lokaler Source-Run in Kurzform
1. `npm ci`
2. `cp apps/backend/.env.example apps/backend/.env`
3. `npm run build --workspace @plex-exporter/frontend`
4. `npm run dev --workspace @plex-exporter/backend`
5. Browser: `http://localhost:4000`

## Was du zuerst konfigurieren solltest
- Admin-Zugang (`ADMIN_USERNAME`, `ADMIN_PASSWORD`)
- SQLite-Pfad bzw. Daten-Mount
- optional Tautulli für Datenimport
- optional TMDB für Anreicherung
- optional Resend für Mail-Funktionen

## Wichtiger Hinweis zu Pfaden
- Im Repository gibt es kein dauerhaft versioniertes Root-`data/`.
- Je nach Startmodus entstehen Daten lokal, unter einem Host-Mount oder im Container unter `/app/data`.
- Die kanonische Pfadreferenz steht unter `../reference/runtime-paths.md`.
