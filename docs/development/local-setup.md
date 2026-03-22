# Entwicklung: Lokales Setup

## Voraussetzungen
- Node `20.x`
- `npm ci`
- funktionierender Build von `better-sqlite3` für die aktive Node-Version

## Standardablauf
1. `npm ci`
2. `cp apps/backend/.env.example apps/backend/.env`
3. `npm run build --workspace @plex-exporter/frontend`
4. `npm run dev --workspace @plex-exporter/backend`

## Warum der Frontend-Build vorher nötig ist
Das Backend liefert sowohl das öffentliche Frontend als auch die Admin-Assets aus `apps/frontend/public` aus. Ohne gebaute Dateien bricht der Backend-Start bewusst ab.

## Native Modul-Hinweis
Nach Node-Wechsel:
```bash
npm ci
npm rebuild better-sqlite3 --workspace @plex-exporter/backend
```
