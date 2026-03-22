# Benutzerhandbuch: Katalog verwenden

## Ansichten und Navigation
- Der Katalog kennt Film- und Serienansicht.
- URL-Hashes wie `#/movies`, `#/shows`, `#/movie/<id>` und `#/show/<id>` werden für Deep Links genutzt.
- Detailansichten öffnen im Frontend über das Modal-/Detailsystem.

## Relevante Funktionen
- Suche und Filter für Genres, Jahr, Collections und Sortierung
- Hero-Bereich für kuratierte Highlights
- Watchlist im Browser
- Newsletter-/Welcome-Mail-Flows, wenn serverseitig konfiguriert

## Watchlist
- Die Watchlist lebt im Browser-`localStorage`.
- Einträge können hinzugefügt, entfernt, exportiert und geleert werden.
- Ohne zentrale Benutzerkonten ist die Watchlist browser- und gerätebezogen.

## Fehlerverhalten
- Bei API- oder Netzwerkfehlern bleibt die Oberfläche nutzbar, zeigt aber Fehlerhinweise.
- Hero und Detailansichten nutzen Caches und Fallbacks, sofern verfügbar.

## Was diese Doku bewusst nicht abdeckt
- genaue Env-Variablen
- Mount- und Backup-Strategien
- lokale Entwickler-Workflows

Dafür siehe `../operations/` und `../development/`.
