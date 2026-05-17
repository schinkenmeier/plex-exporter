# Entwicklung: Lokales Setup

## Voraussetzungen
- Node `24.x`
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
Das native Paket `better-sqlite3` wird gegen die aktive Node-Version gebaut. Das Repository ist per `.npmrc` auf die Engine `24.x` festgelegt; neuere lokale Node-Versionen brechen bewusst früh ab. Nach einem Node-Wechsel zuerst:
```bash
npm ci
```

Wenn Tests danach weiterhin mit einer ABI-Meldung zu `better_sqlite3.node` abbrechen, ist dies der Reparaturpfad:
```bash
npm rebuild better-sqlite3 --workspace @plex-exporter/backend
```

Dieser Hinweis betrifft lokale Source-Runs. Docker-Images bauen ihre Abhängigkeiten im Container selbst und übernehmen keine lokalen `node_modules`.
