# Frontend Workspace

Statisches Frontend für den öffentlichen Katalog und Client-Code für die Admin-UI.

## Bereiche

- `src/main.js`: öffentlicher Katalog.
- `src/admin/main.ts`: Admin-App.
- `src/core/` und `src/features/`: Katalog-Bootstrap, State, Grid, Filter, Hero, Modal, Watchlist, Newsletter.
- `public/`: HTML, Assets, Hero-Policy, Runtime-Config, Build-Ziel.
- `scripts/build.mjs`: esbuild-Build, Bundle-Limits, Config-Kopie.

## Befehle

```bash
npm run build --workspace @plex-exporter/frontend
npm run build:watch --workspace @plex-exporter/frontend
npm run test --workspace @plex-exporter/frontend
npm run type-check --workspace @plex-exporter/frontend
```

## Build-Realitäten

- Build-Ziel ist `apps/frontend/public/dist`.
- Runtime-Konfiguration wird nach `apps/frontend/public/config/frontend.json` kopiert.
- Im Docker-Betrieb liefert Caddy dieses `public/`-Verzeichnis aus.
- Das Backend erwartet dieselben Assets für `/admin` und `/dist`.

## Doku

- Frontend-Details: [../../docs/development/frontend.md](../../docs/development/frontend.md)
- Architektur: [../../docs/development/architecture.md](../../docs/development/architecture.md)
- Konfiguration: [../../docs/reference/configuration.md](../../docs/reference/configuration.md)
