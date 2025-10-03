# Plex Exporter – Offline Katalog

## Überblick
Der Plex Exporter stellt einen statischen Katalog deiner Plex-Bibliotheken bereit. Sämtliche Dateien liegen im Ordner `site/`, die Oberfläche startest du direkt über `site/index.html`. Dadurch lässt sich der Katalog ohne Webserver per Doppelklick oder über ein einfaches Hosting mit rein statischen Dateien öffnen.

## Funktionsumfang
- Umschaltbare Film- und Serienansichten inklusive Deep-Linking über die URL-Fragmentnavigation (`#/movies`, `#/shows`).
- Umfangreiche Filter mit Genres, Jahrspannenauswahl, Sortierung und optionalen TMDB-Postern (gesteuert in `site/js/main.js` und `site/js/filter.js`).
- Schnelle Datenladewege mit Fallbacks für eingebettete JSON-Blöcke oder ältere Exporte (`site/js/data.js`).
- Watchlist mit Export- und Importmöglichkeiten (lokal im Browser gespeichert, Logik in `site/js/watchlist.js`).
- Debug-Overlay zur Fehlersuche mit Quellinformationen, TMDB-Status und Filterzusammenfassung (`site/js/debug.js`).
- Modalansichten für Detailseiten, Scroll-Animationen sowie optionale Bewegungsreduktion.
- Cinematic-Modal mit Sticky-Poster, Schnellinfos und Tabs (implementiert in `site/js/modalV2.js`).

## Projektstruktur
| Pfad | Beschreibung |
| --- | --- |
| `site/index.html` | Einstiegspunkt und UI-Markup für den Katalog. |
| `site/config.json` | Laufzeitkonfiguration (Startansicht, TMDB-Schalter, Sprache). |
| `site/js/main.js` | Bootstrapping der Anwendung, Initialisierung von Filtern, Watchlist, Debug und Einstellungen. |
| `site/js/data.js` | Datenlader mit Unterstützung für lokale Dateien (`site/data/...`) und Legacy-Fallbacks. |
| `site/js/…` | Weitere Module für Filter, Grid, Modals, Services, Utils und Watchlist. |
| `site/data/movies/` | Exportierte Filmdaten (`movies.json`) und optionale Posterordner (`Movie - … .images`). |
| `site/data/series/` | Serienindex (`series_index.json`), Detaildateien (`details/<ratingKey>.json`) und Posterordner (`Show - … .images`). |
| `site/assets/` | Statische Assets wie Favicons und Illustrationen. |
| `tools/split_series.mjs` | Hilfsskript zum Aufteilen großer Serien-JSONs in Index- und Detaildateien. |
| `package.json` | Projektmetadaten und npm-Skripte (z. B. `split:series`). |

## Konfiguration (`site/config.json`)
| Schlüssel | Typ | Beschreibung |
| --- | --- | --- |
| `startView` | String (`"movies"`\|`"shows"`) | Legt fest, welche Bibliothek nach dem Laden angezeigt wird. |
| `tmdbEnabled` | Boolean | Aktiviert den optionalen Abruf von TMDB-Metadaten (wird beim Start berücksichtigt). |
| `tmdbApiKey` | String | Optionaler TMDB v3 API Key als Fallback, wenn kein Token im Browser hinterlegt wurde. |
| `lang` | String | Sprache für TMDB-Anfragen sowie lokalisierte UI-Texte. |

## Datenpflege
### Filme aktualisieren
1. Exportiere deine Filmbibliothek aus Plex (oder Tautulli) als `movies.json` und kopiere die Datei nach `site/data/movies/movies.json`.
2. Lege Poster oder Backdrops optional in eigenen Unterordnern ab (`site/data/movies/Movie - <Titel> [<ratingKey>].images/`). Die Anwendung referenziert Pfade automatisch relativ zum Datenverzeichnis.
3. Öffne `site/index.html`, um den aktualisierten Bestand zu prüfen. Änderungen an den Daten werden beim nächsten Laden erkannt.

### Serien aktualisieren
1. Exportiere deine Serienbibliothek als vollständige JSON-Datei (z. B. aus Plex) und speichere sie als `site/data/series/series_full.json`.
2. Erzeuge Index- und Detaildateien mit `npm run split:series`. Das Skript `tools/split_series.mjs` erstellt `series_index.json` sowie einzelne Dateien unter `site/data/series/details/`.
3. Kopiere Poster/Staffelbilder in passende Unterordner (`site/data/series/Show - <Titel> [<ratingKey>].images/`). Die Anwendung verknüpft Staffel- und Episodenbilder automatisch über `site/js/data.js`.
4. Starte den Katalog neu in `site/index.html`, um die aktualisierten Serien zu überprüfen.

### Datenspeicherung und Fallbacks
- `site/js/data.js` bevorzugt die Dateien unter `site/data/...`. Falls diese fehlen, werden vorhandene `<script>`-Blöcke im HTML oder globale Variablen genutzt. So bleibt der Katalog kompatibel mit früheren Exportformaten.
- Detailansichten laden zusätzliche JSON-Dateien erst beim Öffnen eines Elements, um die Initialladezeit niedrig zu halten.

## Watchlist & Debugging
- Die Watchlist speichert Einträge in `localStorage` (`watchlist:v1`). Über die Buttons im UI kannst du Einträge hinzufügen, entfernen, exportieren oder die Liste leeren. Beim Export wird eine `watchlist.json` im Browser heruntergeladen.
- Das Debug-Overlay (Button "Debug" in den Einstellungen) zeigt Informationen über aktuelle Filter, Datenquellen und TMDB-Status. Die Ausgabe lässt sich direkt kopieren, um Fehlerberichte zu erleichtern.

## TMDB-Integration
- Setze `tmdbEnabled` in `site/config.json` auf `true`, um TMDB-Aufrufe zu erlauben. Standardmäßig bleiben alle Anfragen deaktiviert.
- Hinterlege einen TMDB v4 Bearer Token zur Laufzeit im Einstellungsdialog (`TMDB Token`) oder trage deinen API Key dauerhaft im Feld `tmdbApiKey` ein. Tokens werden im Browser in `localStorage` gespeichert.
- Sobald TMDB aktiviert ist, lädt das Frontend Cover und Backdrops nach (`site/js/services/tmdb.js`). Die Nutzung ist optional und kann jederzeit über den UI-Toggle abgeschaltet werden.

## Nützliche Befehle
| Befehl | Beschreibung |
| --- | --- |
| `npm run split:series` | Ruft `tools/split_series.mjs` auf, verarbeitet `site/data/series/series_full.json` und erzeugt `series_index.json` sowie Detaildateien. |

Viel Spaß beim Verteilen deines Plex-Katalogs!
