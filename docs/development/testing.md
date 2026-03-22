# Entwicklung: Tests

## Root-Befehle
- `npm test`
- `npm run build`
- `npm run type-check`
- `npm run docs:check`

## Frontend
- Runner: Node Test Runner
- Pfad: `apps/frontend/tests/__tests__/`

## Backend
- Runner: Vitest
- Pfad: `apps/backend/tests/`

## Wichtiger Kontext
- Backend-Tests und lokaler Backend-Start können an nativen `better-sqlite3`-Binaries scheitern, wenn Node-Version und Build-Artefakt nicht zusammenpassen.
- Frontend und Backend haben unterschiedliche Test-Runner; die Doku soll das klar benennen, statt vereinheitlichende Annahmen zu treffen.
