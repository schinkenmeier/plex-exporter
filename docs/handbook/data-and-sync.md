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
5. Ergebnis im Katalog, in `/api/v1/*` oder in der Admin-Datenbankansicht prüfen. Die Datenbankansicht ist read-only und zeigt nur freigegebene Tabellen.

## Bilder und Exporte

Cover und exportnahe Artefakte liegen je nach Modus unter einem `exports`-Pfad. Im Container ist das typischerweise `/app/data/exports`, auf dem Host entsprechend unter `BACKEND_DATA_PATH`.

Die V1-API normalisiert lokale Cover-Pfade und Tautulli-Bildpfade auf `/api/thumbnails/*`. Tautulli-Bilder werden über den Tautulli-Proxy ausgeliefert und brauchen keinen lokalen `exports`-Pfad; lokale Cover-, Movie- und Series-Dateien brauchen ihn weiterhin.

Die genaue Matrix steht in [../reference/runtime-paths.md](../reference/runtime-paths.md) und [../reference/data-layout.md](../reference/data-layout.md).

## API-Caches

`/api/v1/*` cached Listen, Details, Stats und TMDB-Proxy-Antworten kurzzeitig. Nach manuellen oder geplanten Tautulli-Syncs werden die Katalog-Caches invalidiert. Fehlerantworten werden nicht gecached.

## Legacy-/Tooling-Pfad

`tools/split_series.mjs` verarbeitet einen Serien-Gesamtexport und schreibt `series_index.json` plus `details/<ratingKey>.json`. Das ist Tooling für exportnahe Daten, nicht der normale produktive Tautulli-Sync.
