# Contributing

## Grundsätze
- Ändere Code und Doku entlang der realen Repo-Struktur, nicht entlang historischer Annahmen.
- Halte Nutzer-, Betriebs- und Entwicklerdoku getrennt.
- Lege dauerhafte Projektdoku nur unter `docs/` ab.
- Lege temporäre Reviews und Arbeitsnotizen nur unter `work/` ab.

## Lokales Setup
1. Node `20.x` verwenden.
2. `npm ci` ausführen.
3. Frontend bauen, bevor das Backend lokal gestartet wird:
   ```bash
   npm run build --workspace @plex-exporter/frontend
   ```
4. Backend mit `apps/backend/.env` starten oder Docker Compose verwenden.

## Pull-Request-Erwartungen
- Relevante Tests ausführen.
- Bei Doku-Änderungen `npm run docs:check` ausführen.
- Dokumentation aktualisieren, wenn Pfade, Kommandos, Oberflächen oder Betriebslogik betroffen sind.
- Keine neuen dauerhaften WIP-Notizen unter `docs/`.
- Keine toten Links oder Doku-Verweise auf nicht versionierte Dateien ohne Laufzeitkontext.

## Doku-Regeln
- `docs/reference/` ist die Quelle für Tabellen zu Pfaden, Env-Variablen und Konfigurationsschlüsseln.
- Paket-Readmes bleiben knapp und verlinken auf die zentrale Doku.
- `deploy/unraid/README.md` ist ein Quickstart-Bundle, nicht die kanonische Betriebsdoku.

## Arbeitsartefakte
- Reviews: `work/reviews/YYYY-MM-DD__thema.review.md`
- Pläne und Migrationsnotizen: `work/plans/`

## Weiterführende Doku
- `docs/README.md`
- `docs/development/local-setup.md`
- `docs/development/testing.md`
