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
- Die Admin-App nutzt den typisierten Client in `src/admin/core/api.ts`. Neue Admin-Endpunkte sollen dort mit Request-/Response-Typen ergänzt und mindestens über `apps/frontend/tests/__tests__/adminApiClient.test.js` gegen Pfad, Methode und Query-/Body-Form abgesichert werden.
- Aktuell abgebildete Admin-Komfort-APIs umfassen unter anderem Logs mit `q`/`offset`/Pagination, Diagnostics Batch, Admin Profile, Watchlist Request Summary/Reply-Templates und Tautulli-Mutationsrouten.

## Tests
- `npm run test --workspace @plex-exporter/frontend`
- `npm run test:coverage --workspace @plex-exporter/frontend`
