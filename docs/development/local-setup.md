# Lokales Setup

## Voraussetzungen

- Node `24.x` (`package.json`, `.nvmrc`, Dockerfiles und CI sind darauf ausgerichtet)
- npm Workspaces
- funktionierender nativer Build von `better-sqlite3`

## Standardablauf

```bash
npm ci
cp apps/backend/.env.example apps/backend/.env
npm run build --workspace @plex-exporter/frontend
npm run dev --workspace @plex-exporter/backend
```

Der Backend-Dev-Server läuft standardmäßig auf `http://localhost:4000`.

## Warum der Frontend-Build vorher nötig ist

Im Standardmodus `ADMIN_UI_MODE=embedded` prüft `apps/backend/src/createServer.ts` beim Start `apps/frontend/public` und `apps/frontend/public/dist`. Das Backend braucht diese Dateien für `/admin` und `/dist`. Ohne Build bricht der Start bewusst mit einer klaren Fehlermeldung ab.

Für reine API-Entwicklung kann `ADMIN_UI_MODE=api-only` gesetzt werden. Dann startet das Backend ohne Frontend-Build; `/health`, `/api/v1/*`, `/admin/api/*`, `/admin/api/tautulli/*` und `/media` bleiben verfügbar, aber `/admin` liefert keine UI aus.

## Lokale Konfiguration

- Lokaler Source-Run: `apps/backend/.env`
- Vorlage: [../../apps/backend/.env.example](../../apps/backend/.env.example)
- Docker Compose: Root-`.env` aus [../../.env.example](../../.env.example)
- Frontend-Runtime-Template: [../../apps/frontend/config/frontend.json.sample](../../apps/frontend/config/frontend.json.sample)

Die vollständige Variablenliste steht in [../reference/environment-variables.md](../reference/environment-variables.md).

## Native SQLite-Fallen

`better-sqlite3` wird gegen die aktive Node-Version gebaut. Nach einem Node-Wechsel zuerst sauber installieren:

```bash
npm ci
```

Wenn Tests oder Start danach weiter mit einer ABI-Meldung zu `better_sqlite3.node` abbrechen:

```bash
npm rebuild better-sqlite3 --workspace @plex-exporter/backend
```

Dieser Hinweis betrifft lokale `node_modules`. Docker-Images bauen ihre Abhängigkeiten im Container mit Node 24.

## Nächste Seiten

- Architektur: [architecture.md](architecture.md)
- Tests: [testing.md](testing.md)
- Backend-Details: [backend.md](backend.md)
- Frontend-Details: [frontend.md](frontend.md)
