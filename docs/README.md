# Dokumentations-Hub

Diese Dokumentation trennt bewusst zwischen Nutzung, Betrieb, Entwicklung, Referenzwissen und temporären Arbeitsartefakten.

## Nach Zielgruppe
### Nutzer und Betreiber
- `handbook/overview.md`
- `handbook/getting-started.md`
- `handbook/using-the-catalog.md`
- `handbook/admin-ui.md`
- `handbook/data-and-sync.md`
- `handbook/troubleshooting.md`

### Betrieb und Deployment
- `operations/docker-compose.md`
- `operations/persistence.md`
- `operations/unraid.md`
- `operations/cloudflare.md`
- `operations/backups-and-updates.md`
- `operations/troubleshooting.md`

### Entwickler und Mitwirkende
- `development/local-setup.md`
- `development/monorepo.md`
- `development/frontend.md`
- `development/backend.md`
- `development/shared-and-tools.md`
- `development/testing.md`
- `development/architecture.md`

### Referenz
- `reference/runtime-paths.md`
- `reference/configuration.md`
- `reference/environment-variables.md`
- `reference/data-layout.md`
- `reference/interfaces.md`

## Single Source of Truth
- Pfade, Mounts und Ablageorte leben nur in `docs/reference/runtime-paths.md` und `docs/reference/data-layout.md`.
- Env-Variablen leben nur in `docs/reference/environment-variables.md`.
- Betriebsabläufe leben nur in `docs/operations/`.
- Contributor-Workflows leben nur in `docs/development/`.
- Paket-Readmes sind lokale Einstiege und verlinken auf diese zentrale Doku.

## Was nicht Teil der offiziellen Doku ist
- `work/` enthält temporäre Reviews, Migrationsnotizen und andere Arbeitsdokumente.
- `tools/browser-debug/` enthält ausführbare Browser-Helfer und keine offizielle Produktdoku.

## Pflegeprinzipien
- Jede neue dauerhafte Projektdoku kommt in `docs/`.
- Jede neue temporäre Arbeitsnotiz kommt in `work/`.
- Keine offizielle Doku soll auf nicht versionierte Root-Pfade verweisen, ohne den Laufzeitkontext zu benennen.
- Doku für Benutzer, Betrieb und Entwicklung wird nicht im selben Dokument vermischt.
