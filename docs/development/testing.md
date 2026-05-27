# Tests und Qualität

## Root-Befehle

```bash
npm test
npm run build
npm run type-check
npm run lint
npm run docs:check
npm run text:check
```

## Workspace-Befehle

```bash
npm run test --workspace @plex-exporter/backend
npm run test:coverage --workspace @plex-exporter/backend
npm run type-check --workspace @plex-exporter/backend

npm run test --workspace @plex-exporter/frontend
npm run test:coverage --workspace @plex-exporter/frontend
npm run type-check --workspace @plex-exporter/frontend
```

## Runner

- Backend: Vitest, Tests unter `apps/backend/tests/` und einzelne Co-located Tests unter `apps/backend/src/`.
- Frontend: Node Test Runner, Tests unter `apps/frontend/tests/__tests__/`.
- Doku-Links: `tools/check-doc-links.mjs`.
- Deutsche Schreibweise: `tools/check-german-transliterations.mjs`.

## Bekannte lokale Risiken

- Backend-Tests nutzen SQLite und können an einer falschen lokalen `better-sqlite3`-ABI scheitern.
- Node `24.x` verwenden; nach einem Node-Wechsel `npm ci` ausführen.
- Wenn nur das native Binary defekt ist: `npm rebuild better-sqlite3 --workspace @plex-exporter/backend`.

Siehe auch [local-setup.md](local-setup.md).
