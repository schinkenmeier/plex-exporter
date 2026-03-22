# Benutzerhandbuch: Daten und Synchronisation

## Primärer Datenpfad
Die aktive Katalogausgabe des Projekts basiert auf der SQLite-Datenbank, die das Backend über `/api/v1/*` ausliefert.

## Tautulli als Hauptquelle
Der reguläre Weg für aktuelle Bibliotheksdaten ist:
1. Tautulli in der Admin-UI oder per ENV konfigurieren.
2. Bibliotheksbereiche auswählen.
3. Manuellen Sync auslösen oder Zeitpläne anlegen.
4. Ergebnisse werden in SQLite persistiert und über die API sichtbar.

## Covers und Export-Artefakte
- Bilddateien und exportnahe Artefakte liegen je nach Laufzeitmodell unter einem `exports`-Pfad.
- Im Container ist das typischerweise `/app/data/exports`.
- Bei lokalen Source-Runs und bei Docker-Bind-Mounts unterscheiden sich die Host-Pfade. Die genaue Matrix steht unter `../reference/data-layout.md`.

## Serien-Splitter
- `tools/split_series.mjs` verarbeitet einen Serien-Gesamtexport.
- Das Ergebnis ist `series_index.json` plus `details/<ratingKey>.json`.
- Dieser Ablauf ist relevant für exportbasierte oder legacy-nahe Datenpflege, nicht für den normalen Tautulli-Sync-Pfad.

## Hero-Policy
- Die Hero-Rotation wird über `hero.policy.json` gesteuert.
- Für Nutzer ist vor allem relevant, dass diese Datei das Verhalten der Highlights bestimmt.
- Die technische Konfigurationslogik steht unter `../reference/configuration.md`.
