# Frontend Workspace

Dieses Paket enthält das öffentliche Katalog-Frontend und den Build der Admin-Oberfläche.

## Wichtige Bereiche
- `src/main.js`: Bootstrap für den öffentlichen Katalog.
- `src/admin/`: modulare Admin-Oberfläche.
- `public/`: auslieferbare HTML-Dateien, Assets, Runtime-Config und Build-Output.
- `scripts/build.mjs`: esbuild-Build inklusive Config-Kopie nach `public/config/`.
- `tests/__tests__/`: Frontend-Tests.

## Befehle
- `npm run build --workspace @plex-exporter/frontend`
- `npm run build:watch --workspace @plex-exporter/frontend`
- `npm run test --workspace @plex-exporter/frontend`
- `npm run test:coverage --workspace @plex-exporter/frontend`

## Hinweise
- Das Backend erwartet die gebauten Assets in `apps/frontend/public`.
- Das versionierte Frontend-Config-Template liegt unter `apps/frontend/config/frontend.json.sample`.
- Die Runtime-Datei in `apps/frontend/public/config/` wird durch den Build erzeugt.

## Doku
- Frontend-Entwicklerdoku: `../../docs/development/frontend.md`
- Konfigurations- und Pfadreferenz: `../../docs/reference/`
