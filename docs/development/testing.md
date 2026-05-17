# Entwicklung: Tests

## Root-Befehle
- `npm test`
- `npm run build`
- `npm run type-check`
- `npm run lint`
- `npm run docs:check`

## Frontend
- Runner: Node Test Runner
- Pfad: `apps/frontend/tests/__tests__/`

## Backend
- Runner: Vitest
- Pfad: `apps/backend/tests/`

## Wichtiger Kontext
- Backend-Tests und lokaler Backend-Start können an nativen `better-sqlite3`-Binaries scheitern, wenn Node-Version und Build-Artefakt nicht zusammenpassen.
- Lokal Node `24.x` verwenden; `.nvmrc`, `.npmrc`, `package.json`, CI und Dockerfiles sind darauf ausgerichtet.
- Nach einem Node-Wechsel zuerst `npm ci` ausführen. `npm rebuild better-sqlite3 --workspace @plex-exporter/backend` ist nur ein Reparaturpfad, wenn lokale native Artefakte weiterhin zur falschen Node-ABI passen.
- Frontend und Backend haben unterschiedliche Test-Runner; die Doku soll das klar benennen, statt vereinheitlichende Annahmen zu treffen.
