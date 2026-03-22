# Entwicklung: Frontend

## Einstiegspunkte
- `src/main.js`: öffentlicher Katalog
- `src/admin/main.ts`: Admin-App
- `scripts/build.mjs`: Build, Bundle-Limits und Config-Kopie

## Struktur
- `src/core/`: Bootstrapping, State, Loader, Fehlerbehandlung, Config-Loader
- `src/features/`: Katalogfunktionen wie Filter, Grid, Hero, Modal, Watchlist
- `src/admin/`: modulare Admin-Oberfläche
- `public/`: HTML, Assets, Hero-Policy, erzeugte Config und Build-Output

## Relevante Realitäten
- Das Frontend lädt Runtime-Konfiguration aus `/config/frontend.json`.
- Der Build kopiert das Template aus `apps/frontend/config/frontend.json.sample` nach `public/config/`.
- Das Backend erwartet die gebauten Dateien anschließend genau dort.

## Tests
- `npm run test --workspace @plex-exporter/frontend`
- `npm run test:coverage --workspace @plex-exporter/frontend`
