# Betrieb: Persistenz und Datenpfade

## Ziel
Diese Seite beschreibt, wo persistente Daten im Betrieb liegen und wie sich lokale Source-Runs von Container-Runs unterscheiden.

## Containerbetrieb
- Host-Pfad: über `BACKEND_DATA_PATH`
- Container-Pfad: `/app/data`
- SQLite: `/app/data/sqlite/plex-exporter.sqlite`
- Exporte/Covers: `/app/data/exports`

## Lokaler Source-Run
- Default-SQLite-Pfad aus dem Backend: `../../data/sqlite/plex-exporter.sqlite`
- Exportsuche erfolgt über Kandidaten wie `data/exports`
- Diese Pfade entstehen lokal erst, wenn sie benötigt werden

## Wichtige Konsequenz
Es gibt nicht den einen universellen Host-Pfad für alle Modi. Die kanonische Übersetzung steht in `../reference/runtime-paths.md` und `../reference/data-layout.md`.

## Backup-Empfehlung
- SQLite-Datei sichern
- Export-/Cover-Verzeichnisse sichern, wenn sie produktiv genutzt werden
- bei Unraid das komplette Appdata-Verzeichnis einbeziehen
