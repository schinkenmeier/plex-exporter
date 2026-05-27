# Daten und Synchronisation

## Normaler Datenfluss

```text
Tautulli -> Sync-Service -> SQLite -> /api/v1/* -> Frontend
```

Tautulli ist die Hauptquelle für Bibliotheksdaten. Der Sync persistiert Filme, Serien, Staffeln, Episoden, Cast, Library Sections, Snapshots und weitere Betriebsdaten in SQLite.

## Sync-Bedienung

1. Tautulli per Env oder Admin-UI konfigurieren.
2. Verbindung in der Admin-UI testen.
3. Library Sections auswählen.
4. Manuellen Sync starten oder Zeitplan anlegen.
5. Ergebnis im Katalog, in `/api/v1/*` oder in der Admin-Datenbankansicht prüfen.

## Bilder und Exporte

Cover und exportnahe Artefakte liegen je nach Modus unter einem `exports`-Pfad. Im Container ist das typischerweise `/app/data/exports`, auf dem Host entsprechend unter `BACKEND_DATA_PATH`.

Die genaue Matrix steht in [../reference/runtime-paths.md](../reference/runtime-paths.md) und [../reference/data-layout.md](../reference/data-layout.md).

## Legacy-/Tooling-Pfad

`tools/split_series.mjs` verarbeitet einen Serien-Gesamtexport und schreibt `series_index.json` plus `details/<ratingKey>.json`. Das ist Tooling für exportnahe Daten, nicht der normale produktive Tautulli-Sync.
