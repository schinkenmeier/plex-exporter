# Testing Modal V3 - Backdrop & Cast Images

## Schnellanleitung

### 1. Öffne die Website
Starte deine Plex Exporter Website im Browser

### 2. Öffne die Developer Console
- Drücke **F12** oder
- Rechtsklick → **Untersuchen** → **Console-Tab**

### 3. Öffne ein Modal
- Klicke auf einen **Film** oder eine **Serie**
- Das Modal V3 sollte sich öffnen

### 4. Prüfe die Console
Die Console zeigt jetzt automatisch Logs an, die mit `[modalV3]` beginnen:

```
[modalV3] openMovieDetailV3 called with payload: ...
[modalV3/viewModel] buildBackdropEntry for "The Matrix": ...
[modalV3/viewModel] buildCastEntries: ...
[modalV3] Movie ViewModel loaded: ...
[modalV3] Movie backdrop: { url: "...", source: "..." }
[modalV3] Movie cast count: 12
```

## Was die Logs bedeuten

### ✅ **Erfolgreicher Fall** - Backdrop lädt:
```
[modalV3/viewModel] buildBackdropEntry for "The Matrix":
  tmdbBackdrop_path: "/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg"

[modalV3/viewModel] normaliseImageUrl: "/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg"
  -> "https://image.tmdb.org/t/p/w780/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg"

[modalV3/viewModel] Selected backdrop:
  { url: "https://image.tmdb.org/t/p/w780/...", source: "tmdb" }
```

### ❌ **Fehlgeschlagener Fall** - Backdrop fehlt:
```
[modalV3/viewModel] buildBackdropEntry for "The Matrix":
  tmdbBackdrop: undefined
  tmdbBackdropPath: undefined
  tmdbBackdrop_path: undefined  <-- ALLE undefined = Problem!

[modalV3/viewModel] Selected backdrop:
  { url: "data:image/svg+xml;...", source: "fallback" }  <-- Fallback = kein TMDB Bild
```

### ✅ **Erfolgreicher Fall** - Cast lädt:
```
[modalV3/viewModel] buildCastEntries:
  localCastCount: 0
  tmdbCreditsCount: 12  <-- TMDB Cast gefunden!

[modalV3/viewModel] First TMDB cast member:
  name: "Keanu Reeves"
  profile_path: "/abc123.jpg"  <-- Profile path vorhanden!

[modalV3/viewModel] First cast image result:
  { url: "https://image.tmdb.org/t/p/w185/abc123.jpg", source: "tmdb" }
```

### ❌ **Fehlgeschlagener Fall** - Cast fehlt:
```
[modalV3/viewModel] buildCastEntries:
  tmdbCreditsCount: 0  <-- Keine TMDB Cast-Daten!
```

## Optionaler Debug-Script

Falls die automatischen Logs nicht ausreichen, kopiere diesen Code in die Console NACHDEM du ein Modal geöffnet hast:

```javascript
// Kopiere site/debug-modal.js Inhalt hier
```

Oder lade die Datei `site/debug-modal.js` direkt.

## Probleme?

### Console zeigt keine `[modalV3]` Logs
- **Build vergessen?** Führe `npm run build` aus
- **Seite nicht neu geladen?** Drücke Strg+Shift+R für Hard-Reload
- **Falsches Modal?** Stelle sicher, dass das Modal V3 geöffnet wird (nicht das alte Modal)

### Backdrop zeigt "fallback"
- TMDB-Daten werden nicht geladen → Prüfe Network-Tab nach TMDB API-Calls
- `tmdbBackdrop_path` ist undefined → Film hat kein Backdrop in TMDB
- API-Key fehlt oder ungültig → Prüfe metadataService Konfiguration

### Cast count ist 0
- Keine TMDB Credits → Film hat keine Cast-Daten in TMDB
- metadataService lädt keine Credits → Prüfe ob `getMovieEnriched` Credits zurückgibt

## Nächste Schritte

Nachdem du ein Modal geöffnet hast:

1. **Kopiere ALLE Console-Logs** die mit `[modalV3]` beginnen
2. **Mache einen Screenshot** vom Modal (zeigt ob Bilder fehlen)
3. **Teile beides** damit wir das Problem identifizieren können

Besonders wichtig:
- `buildBackdropEntry` Log
- `buildCastEntries` Log
- `Selected backdrop` Log
- `Movie/Series backdrop` Log aus index.js
