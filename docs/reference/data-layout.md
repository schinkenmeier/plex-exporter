# Referenz: Datenlayout

## Source-Run gegen lokalen Dateibaum
Typische Struktur, wenn das Backend direkt aus dem Repo startet:

```text
data/
  sqlite/
    plex-exporter.sqlite
  exports/
    covers/
    movies/
    series/
      series_index.json
      details/
```

## Docker-/Compose-Betrieb
Im Container ist die Datenwurzel `/app/data`. Auf dem Host sieht die Struktur unter `BACKEND_DATA_PATH` typischerweise so aus:

```text
<BACKEND_DATA_PATH>/
  sqlite/
    plex-exporter.sqlite
  exports/
    covers/
    movies/
    series/
      series_index.json
      details/
```

## Serien-Splitter
- Eingabe: z. B. `series_full.json`
- Ausgabe:
  - `series_index.json`
  - `details/<ratingKey>.json`

## Wofür `exports/` genutzt wird
- exportnahe oder legacy-nahe Medienartefakte
- Covers und heruntergeladene Bilder
- Thumbnail-Auslieferung über `/api/thumbnails/*`
