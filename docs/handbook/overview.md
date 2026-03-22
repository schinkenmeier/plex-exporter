# Benutzerhandbuch: Überblick

Dieses Handbuch richtet sich an Menschen, die Plex Exporter benutzen, konfigurieren oder im Alltag betreiben wollen, ohne sich durch den Quellcode arbeiten zu müssen.

## Was Plex Exporter bereitstellt
- einen webbasierten Katalog für Filme und Serien
- Filter, Suche und Detailansichten
- eine Watchlist im Browser
- optionale Newsletter- und E-Mail-Flows
- eine geschützte Admin-Oberfläche für Betrieb, Konfiguration und Tautulli-Sync

## Welche Teile du als Nutzer siehst
- `/`: der öffentliche Katalog
- `/admin`: die geschützte Admin-Oberfläche
- `/health`: einfacher Betriebscheck

## Begriffe
- `Admin-UI`: die Verwaltungsoberfläche unter `/admin`
- `Tautulli-Sync`: Übernahme von Bibliotheksdaten aus Tautulli in die SQLite-Datenbank
- `Hero-Policy`: JSON-Datei für Regeln der Hero-Rotation
- `series_index.json`: vorbereiteter Serienindex für exportbasierte/legacy-nahe Datenabläufe

## Wie du weiterlesen solltest
- Erste Inbetriebnahme: `getting-started.md`
- Bedienung des Katalogs: `using-the-catalog.md`
- Admin-Oberfläche: `admin-ui.md`
- Datenpflege und Sync: `data-and-sync.md`
- Häufige Probleme: `troubleshooting.md`
