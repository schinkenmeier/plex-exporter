# Shared Models

Dieses Paket bündelt Schnittstellen, die zwischen Frontend und Backend geteilt werden können. Ziel ist eine einheitliche Sprache für Exporte, API-Responses und Konfigurationswerte.

## Enthaltene Typen
- `MediaItem`: Basismodell für Filme und Serien aus Plex-Exports.
- `MediaLibrary`: Sammlungsmetadaten für UI-Filter und Backend-Endpunkte.
- `TmdbCredentials`: Gemeinsame Struktur zur Beschreibung von TMDB-Zugangsdaten.

Die Implementierungen finden sich in `src/index.ts` und lassen sich später von Build-Systemen (`tsc`, `tsup`, `esbuild`) nach JavaScript/Typdefinitionen ausgeben.

## Verwendung
```ts
import type { MediaItem, TmdbCredentials } from '@plex-exporter/shared';
```

## Nächste Schritte
- Erweiterung um API-spezifische Antwortformate.
- Ableitung von Schemas (z. B. Zod) auf Basis derselben Interfaces.
- Veröffentlichung als separates Paket, sobald Versionierung nötig wird.
