# Shared Package

Dieses Workspace-Paket kapselt gemeinsam genutzte Modelle, Filter- und Paging-Helfer für Frontend und Backend.

## Enthalten
- gemeinsame Typdefinitionen aus `src/index.d.ts`
- Laufzeit-Helfer aus `src/filter.js` und `src/media.js`
- Konstanten wie Paging-Grenzen und Sortierwerte

## Beispiel
```ts
import type { MediaItem } from '@plex-exporter/shared';
import { filterMediaItemsPaged } from '@plex-exporter/shared';
```

## Doku
- Architektur und Datenfluss: `../../docs/development/architecture.md`
- Paketrollen im Monorepo: `../../docs/development/monorepo.md`
- Daten- und Schnittstellenreferenz: `../../docs/reference/interfaces.md`
