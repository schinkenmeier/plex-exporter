# Modal V3 Debugging - Backdrop und Cast-Profile

## Problem
- Hero-Banner lädt keine TMDB-Backdrops
- Cast-Bilder werden nicht geladen

## WICHTIG: Wie man die Logs sieht

Die Console-Logs erscheinen **AUTOMATISCH** wenn du ein Modal öffnest!

**Du musst NICHTS in die Console eingeben!**

1. Öffne die Developer Console (F12)
2. Klicke auf einen Film oder Serie
3. Die Logs erscheinen automatisch in der Console

Suche nach Logs die mit `[modalV3]` oder `[modalV3/viewModel]` beginnen.

## Debugging-Logs hinzugefügt

Die folgenden Console-Logs wurden hinzugefügt und erscheinen **AUTOMATISCH**:

### 0. Modal-Öffnung (index.js)
```javascript
console.log('[modalV3] openMovieDetailV3 called with payload:', ...);
console.log('[modalV3] Movie ViewModel loaded:', ...);
console.log('[modalV3] Movie backdrop:', { url: '...', source: '...' });
console.log('[modalV3] Movie cast count:', 5);
```

### 1. Backdrop-Daten (viewModel.js)
```javascript
console.log('[modalV3/viewModel] buildBackdropEntry for "...":', {
  tmdbBackdrop: ...,
  tmdbBackdropPath: ...,
  tmdbBackdrop_path: ...,
  collectionBackdrop: ...,
  itemArt: ...,
  itemBackground: ...
});
console.log('[modalV3/viewModel] Selected backdrop:', { url, source });
```

### 2. Cast-Daten (viewModel.js)
```javascript
console.log('[modalV3/viewModel] buildCastEntries:', {
  localCastCount: ...,
  tmdbCreditsCount: ...,
  sampleTmdbCredit: ...,
  hasTmdbCredits: ...,
  hasItemTmdbCredits: ...
});

console.log('[modalV3/viewModel] First TMDB cast member:', {
  name: ...,
  profile: ...,
  profile_path: ...,
  profilePath: ...
});

console.log('[modalV3/viewModel] First cast image result:', { url, source });
```

### 3. URL-Normalisierung (viewModel.js)
```javascript
console.log('[modalV3/viewModel] normaliseImageUrl: "..." -> "..."');
console.log('[modalV3/viewModel] normaliseImageUrl: unhandled format "..."');
```

## Wie teste ich im Browser?

1. **Öffne die Plex Exporter Website** im Browser
2. **Öffne die Developer Console** (F12 / Rechtsklick > Untersuchen > Console)
3. **Öffne ein Film- oder Serien-Modal V3**
   - Klicke auf einen Film oder eine Serie
   - Das Modal sollte sich öffnen
4. **Prüfe die Console-Logs**
   - Suche nach `[modalV3/viewModel]` Logs
   - Prüfe, welche Daten für Backdrops und Cast ankommen

## Was zu prüfen ist:

### Backdrop-Problem
- Sind `tmdb.backdrop_path` oder `tmdb.backdropPath` vorhanden?
- Wenn ja, welchen Wert haben sie? (z.B. `/abc123.jpg`)
- Wie lautet die finale URL nach der Normalisierung?
- Wird die URL korrekt zu `https://image.tmdb.org/t/p/w780/abc123.jpg` konvertiert?

### Cast-Profile-Problem
- Wie viele TMDB Cast-Members werden gefunden? (`tmdbCreditsCount`)
- Hat der erste Cast-Member ein `profile_path` Feld?
- Welchen Wert hat `profile_path`? (z.B. `/def456.jpg`)
- Wie lautet die finale Image-URL nach der Normalisierung?
- Wird die URL korrekt zu `https://image.tmdb.org/t/p/w185/def456.jpg` konvertiert?

## Mögliche Ursachen

### Falls keine TMDB-Daten vorhanden sind:
- `metadataService.getMovieEnriched()` / `getTvEnriched()` geben keine Daten zurück
- TMDB API Key fehlt oder ist ungültig
- Netzwerk-Fehler beim Laden der TMDB-Daten

### Falls TMDB-Daten vorhanden aber Pfade leer sind:
- TMDB gibt für diesen Film/Serie keine Backdrop/Profile zurück
- Backdrop/Profile existieren nicht in TMDB

### Falls Pfade vorhanden aber Bilder laden nicht:
- URL-Normalisierung schlägt fehl
- CORS-Problem beim Laden der TMDB-Bilder
- TMDB-Server nicht erreichbar

## Erwartete Logs (Beispiel)

### Erfolgreicher Fall:
```
[modalV3/viewModel] buildBackdropEntry for "The Matrix":
  tmdbBackdrop: undefined
  tmdbBackdropPath: undefined
  tmdb Backdrop_path: "/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg"
  collectionBackdrop: undefined
  itemArt: "..."
  itemBackground: undefined

[modalV3/viewModel] normaliseImageUrl: "/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg" -> "https://image.tmdb.org/t/p/w780/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg"

[modalV3/viewModel] Selected backdrop: { url: "https://image.tmdb.org/t/p/w780/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg", source: "tmdb" }
```

### Fehlgeschlagener Fall:
```
[modalV3/viewModel] buildBackdropEntry for "The Matrix":
  tmdbBackdrop: undefined
  tmdbBackdropPath: undefined
  tmdbBackdrop_path: undefined
  collectionBackdrop: undefined
  itemArt: undefined
  itemBackground: undefined

[modalV3/viewModel] Selected backdrop: { url: "data:image/svg+xml;...", source: "fallback" }
```

## Nächste Schritte

Basierend auf den Logs können wir:
1. Feststellen, ob TMDB-Daten ankommen
2. Prüfen, ob die Pfade korrekt extrahiert werden
3. Verifizieren, dass die URL-Normalisierung funktioniert
4. Identifizieren, an welcher Stelle das Problem liegt

Bitte teile die Console-Logs nach dem Öffnen eines Modals!
