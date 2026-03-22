# Entwicklung: Shared Package und Tools

## Shared Package
- enthält Typdefinitionen und Laufzeit-Helfer für Filter, Paging und Medientransformation
- wird sowohl vom Frontend als auch vom Backend importiert

## Tools
- `split_series.mjs`: erzeugt `series_index.json` und Detaildateien
- `analyze-bundle.mjs`: analysiert Frontend-Bundles
- `tautulli-mock/`: Mock-Server
- `browser-debug/`: ausführbare Browser-Helfer

## Abgrenzung
- `tools/` ist kein offizieller Doku-Ort
- Browser-Debug-Skripte sind ausführbare Hilfen und werden nur aus der Entwicklerdoku referenziert
