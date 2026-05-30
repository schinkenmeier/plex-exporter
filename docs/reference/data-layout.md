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

## Wichtige SQLite-Bereiche

- Katalogdaten: `media_items`, `seasons`, `episodes`, `cast_members`, `media_cast`, `media_thumbnails`.
- Tautulli-Betrieb: `library_sections`, `sync_schedules`, `tautulli_snapshots`, `tautulli_config`.
- Konfiguration und Jobs: `integration_settings`, `import_jobs`, `import_schedules`, `hero_pools`.
- Mail-Flows: `newsletter_subscriptions`, `newsletter_digests`, `newsletter_campaigns`, `newsletter_campaign_recipients`, `welcome_emails`.
- Watchlist-Anfragen: `watchlist_requests` speichert das Request-Paket inklusive `items[]`; `watchlist_request_events` speichert Historie wie Erstellung, Statuswechsel, Notizen und Antworten.

Newsletter-Campaigns speichern Drafts, Test-/Send-fähige Inhalte, Medienauswahl und Versandzähler. `newsletter_campaign_recipients` hält pro Campaign E-Mail-Adresse, optionalen Subscription-Bezug, Empfängerstatus, Resend-ID, Fehlermeldung und `sent_at`. `newsletter_digests` bleibt als Legacy-History für den bisherigen Digest-/Shortcut-Flow lesbar.
