# Backend Workspace

Dieses Paket enthält das Express-/TypeScript-Backend für API, Admin-Oberfläche, Tautulli-Synchronisation, Scheduler und SQLite-Zugriff.

## Lokaler Start
1. Abhängigkeiten installieren:
   ```bash
   npm ci
   ```
2. Backend-Umgebung anlegen:
   ```bash
   cp apps/backend/.env.example apps/backend/.env
   ```
3. Frontend bauen, damit Admin-Assets verfügbar sind:
   ```bash
   npm run build --workspace @plex-exporter/frontend
   ```
4. Backend starten:
   ```bash
   npm run dev --workspace @plex-exporter/backend
   ```

## Wichtige Befehle
- `npm run dev --workspace @plex-exporter/backend`
- `npm run start --workspace @plex-exporter/backend`
- `npm run build --workspace @plex-exporter/backend`
- `npm run test --workspace @plex-exporter/backend`
- `npm run test:coverage --workspace @plex-exporter/backend`

## Lokale Dateien
- `src/server.ts`: Prozess-Entry.
- `src/createServer.ts`: Server-Zusammenbau, Middleware, Router und Admin-UI-Einbindung.
- `src/config/index.ts`: ENV-Parsing und Konfigurationsobjekt.
- `src/routes/`: Public-, Protected- und Admin-Routen.
- `tests/`: aktive Backend-Test-Suite.

## Doku
- Zentrale Entwicklerdoku: `../../docs/development/backend.md`
- Architektur und Datenfluss: `../../docs/development/architecture.md`
- ENV- und Pfadreferenz: `../../docs/reference/`

## Hinweise
- Das Backend liefert die gebauten Frontend-Assets aus `apps/frontend/public` aus.
- Die lokale `.env` ist für Source-Runs gedacht; Docker Compose nutzt stattdessen die Root-`.env`.
