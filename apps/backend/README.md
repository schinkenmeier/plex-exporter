# Backend Workspace

Express-/TypeScript-Backend für API, Admin-UI, Tautulli-Sync, Scheduler, SQLite/Drizzle und Integrationen.

## Einstiegspunkte

- `src/server.ts`: Prozessstart.
- `src/createServer.ts`: Runtime, Middleware, Routen, Admin-Assets.
- `src/config/index.ts`: Env-Parsing und Konfigurationsobjekt.
- `src/routes/`: Public-, Protected- und Admin-Routen. Die Admin-Shell liegt in `src/routes/admin.ts`; fachliche Admin-Router liegen unter `src/routes/admin/`.
- `src/services/`: Tautulli, Scheduler, Hero, TMDB, Resend, Logging.
- `src/repositories/`: SQLite/Drizzle-Zugriff.

## Lokaler Start

```bash
npm ci
cp apps/backend/.env.example apps/backend/.env
npm run build --workspace @plex-exporter/frontend
npm run dev --workspace @plex-exporter/backend
```

Der Frontend-Build ist im Standardmodus `ADMIN_UI_MODE=embedded` nötig, weil das Backend `/admin` und `/dist` aus `apps/frontend/public` einbindet. Für reine API-Entwicklung kann `ADMIN_UI_MODE=api-only` genutzt werden.

## Befehle

```bash
npm run dev --workspace @plex-exporter/backend
npm run build --workspace @plex-exporter/backend
npm run test --workspace @plex-exporter/backend
npm run type-check --workspace @plex-exporter/backend
```

## Doku

- Lokales Setup: [../../docs/development/local-setup.md](../../docs/development/local-setup.md)
- Architektur: [../../docs/development/architecture.md](../../docs/development/architecture.md)
- Konfiguration: [../../docs/reference/configuration.md](../../docs/reference/configuration.md)
- Schnittstellen: [../../docs/reference/interfaces.md](../../docs/reference/interfaces.md)
