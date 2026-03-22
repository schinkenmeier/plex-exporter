# Tools Workspace

Dieses Workspace-Paket enthält Hilfsskripte und Debug-Utilities.

## Verfügbare Befehle
- `npm run split:series --workspace @plex-exporter/tools`
  Erwartet ein Serien-Gesamtexport-JSON und schreibt `series_index.json` plus `details/<ratingKey>.json`.
- `npm run analyze --workspace @plex-exporter/tools`
  Analysiert die Frontend-Bundles anhand der esbuild-Metafiles.

## Weitere Inhalte
- `tautulli-mock/`: Mock-Server für lokale Entwicklung und Integrationstests.
- `browser-debug/`: copy/paste-fähige Browser-Skripte für Frontend-Debugging.

## Doku
- Tooling-Überblick: `../docs/development/shared-and-tools.md`
- Datenlayout und Serien-Splitter-Kontext: `../docs/reference/data-layout.md`
