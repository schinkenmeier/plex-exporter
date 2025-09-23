# Plex Exporter - Offline Katalog

Dieses Projekt liefert einen statischen Plex-Katalog, der direkt im Browser ohne Webserver laeuft. plex_katalog_index.html liegt im Projektstamm und greift auf die Bibliotheken in Filme/ und Serien/ zu. Ein Umschalter in der Toolbar wechselt zwischen den Bibliotheken.

## Ordnerstruktur

- plex_katalog_index.html - Bedienoberflaeche fuer Filme und Serien
- Filme/ - movies.js (offline Daten), movies.json (Roh-Export) und Poster-Unterordner
- Serien/ - series.js, series.json und Poster (nach Export erzeugen)

## Schnellstart

1. Lege plex_katalog_index.html, den Ordner Filme/ und bei Bedarf Serien/ gemeinsam weiter.
2. Oeffne plex_katalog_index.html per Doppelklick - standardmaessig werden die Filme aus Filme/movies.js geladen.
3. Nutze den Umschalter oben links, um zwischen Filme und Serien zu wechseln.

## Header und Filter

- Hero-Bereich zeigt Titel, Zufalls-Backdrop und Statistik (Filme | Serien).
- Sticky Toolbar darunter: Suche und Sortierung sind immer sichtbar.
- Button "Erweiterte Filter" blendet Genre-Chips, Jahr-Spanne, Neu-Toggle und TMDB-Option ein.
- Filteraenderungen landen direkt in der URL - Link teilen reicht, um denselben Blick zu oeffnen.

## Daten aktualisieren

### Filme

1. Exportiere wie gewohnt movies.json (z. B. via Tautulli) nach Filme/movies.json.
2. Erzeuge Filme/movies.js, damit die Seite ohne Fetch funktioniert:
   ```powershell
   cd Filme
   python -c "import json, pathlib; base = pathlib.Path('.'); data = json.load(open('movies.json', encoding='utf-8')); payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')); out = base/'movies.js'; out.write_text('window.__PLEX_EXPORTER__ = window.__PLEX_EXPORTER__ || {};
' + 'window.__PLEX_EXPORTER__.movies = ' + payload + ';
' + 'window.__PLEX_MOVIES__ = window.__PLEX_EXPORTER__.movies;
', encoding='utf-8')"
   ```
3. Filme/movies.json kann als Fallback liegen bleiben - sie wird nur genutzt, wenn kein movies.js vorhanden ist.

### Serien

1. Exportiere series.json nach Serien/series.json.
2. Erzeuge Serien/series.js analog zum Filmskript (ersetzt movies durch series).
3. Poster (thumbFile) im Serien/-Unterordner werden automatisch als Fallback genutzt.

## TMDB Bilder

- Der Toggle ist standardmaessig aus. Erst bei Aktivierung werden Poster/Backdrop von TMDB nachgeladen.
- Trage deinen TMDB v4 Bearer Token in CONFIG.tmdbAccessToken ein (alternativ v3 API Key in CONFIG.tmdbApiKey).

## Anpassungen

- Farben, Hero und Filter liegen direkt im CSS-Block von plex_katalog_index.html.
- Die Scripts laden Daten aus window.__PLEX_EXPORTER__, <script id="movies-json"> / <script id="series-json"> oder greifen auf Filme/movies.json bzw. Serien/series.json zurueck.
- Fuer weitere Bibliotheken kannst du zusaetzliche Eintraege in CONFIG.libraries anlegen.

Viel Spass beim Teilen deines Katalogs!
