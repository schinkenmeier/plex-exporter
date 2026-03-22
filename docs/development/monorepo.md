# Entwicklung: Monorepo und Workspaces

## Workspaces
- `apps/frontend`
- `apps/backend`
- `packages/shared`
- `tools`

## Rollen
- `apps/frontend`: Katalog-Frontend und Admin-UI-Build
- `apps/backend`: API, Admin-Routen, Scheduler, Repositories und Services
- `packages/shared`: gemeinsame Typen und Filter-/Paging-Helfer
- `tools`: Hilfsskripte, Mock-Server, Browser-Debugging

## Relevante Repo-Besonderheiten
- Es gibt kein versioniertes Root-`config/`.
- Es gibt kein versioniertes Root-`data/`.
- Je nach Laufzeitmodus unterscheiden sich reale Datenpfade deutlich.
- `apps/frontend/public` ist nicht nur statisch, sondern zugleich Auslieferungsziel für den Build.
