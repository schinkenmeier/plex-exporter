# Tools Workspace

Hilfsskripte für Doku-Qualität, Datenaufbereitung, Bundle-Analyse und Debugging.

## Befehle

```bash
npm run docs:check --workspace @plex-exporter/tools
npm run text:check --workspace @plex-exporter/tools
npm run split:series --workspace @plex-exporter/tools
npm run analyze --workspace @plex-exporter/tools
```

## Inhalte

- `check-doc-links.mjs`: prüft Markdown-Links in versionierten und unversionierten Markdown-Dateien.
- `check-german-transliterations.mjs`: findet typische ASCII-Umschreibungen deutscher Umlaute.
- `split_series.mjs`: erzeugt `series_index.json` und `details/<ratingKey>.json` aus einem Serien-Gesamtexport.
- `analyze-bundle.mjs`: wertet Frontend-Bundle-Metafiles aus.
- `browser-debug/`: ausführbare Browser-Debug-Hilfen.

## Doku

- Tests und Qualität: [../docs/development/testing.md](../docs/development/testing.md)
- Datenlayout: [../docs/reference/data-layout.md](../docs/reference/data-layout.md)
