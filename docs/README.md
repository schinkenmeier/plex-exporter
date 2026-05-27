# Dokumentation

Diese Doku beschreibt den aktuellen Stand des Repos. Sie ist als schneller Einstieg für Menschen und AI-Agenten gedacht: wenige kanonische Seiten, kurze lokale READMEs und klare Querverweise.

## Einstieg nach Frage

| Frage | Dokument |
| --- | --- |
| Was ist das Tool? | [handbook/overview.md](handbook/overview.md) |
| Wie starte ich lokal? | [development/local-setup.md](development/local-setup.md) |
| Wie läuft Betrieb oder Deployment? | [operations/docker-compose.md](operations/docker-compose.md), [operations/unraid.md](operations/unraid.md) |
| Wie fließen Daten durch das System? | [development/architecture.md](development/architecture.md) |
| Welche Konfiguration und Pfade zählen? | [reference/configuration.md](reference/configuration.md), [reference/runtime-paths.md](reference/runtime-paths.md) |
| Wie teste oder prüfe ich Änderungen? | [development/testing.md](development/testing.md) |
| Wo suche ich Fehler? | [operations/troubleshooting.md](operations/troubleshooting.md) |

## Repo-Karte

- Backend: [../apps/backend/README.md](../apps/backend/README.md)
- Frontend: [../apps/frontend/README.md](../apps/frontend/README.md)
- Shared-Code: [../packages/shared/README.md](../packages/shared/README.md)
- Tools: [../tools/README.md](../tools/README.md)
- Docker Compose: [operations/docker-compose.md](operations/docker-compose.md)
- Unraid: [operations/unraid.md](operations/unraid.md)

## Kanonische Themen

- Überblick und Bedienung: [handbook/overview.md](handbook/overview.md), [handbook/admin-ui.md](handbook/admin-ui.md), [handbook/data-and-sync.md](handbook/data-and-sync.md)
- Entwicklung: [development/local-setup.md](development/local-setup.md), [development/architecture.md](development/architecture.md), [development/testing.md](development/testing.md)
- Betrieb: [operations/docker-compose.md](operations/docker-compose.md), [operations/persistence.md](operations/persistence.md), [operations/cloudflare.md](operations/cloudflare.md), [operations/backups-and-updates.md](operations/backups-and-updates.md)
- Referenz: [reference/configuration.md](reference/configuration.md), [reference/environment-variables.md](reference/environment-variables.md), [reference/runtime-paths.md](reference/runtime-paths.md), [reference/interfaces.md](reference/interfaces.md), [reference/data-layout.md](reference/data-layout.md)

## Pflege-Regeln

- Fakten zu Variablen stehen in [reference/environment-variables.md](reference/environment-variables.md).
- Fakten zu Pfaden stehen in [reference/runtime-paths.md](reference/runtime-paths.md) und [reference/data-layout.md](reference/data-layout.md).
- Abläufe für Betrieb stehen in `operations/`, Abläufe für Entwicklung in `development/`.
- Workspace-READMEs bleiben kurz und verlinken auf diese Doku.
- `work/` ist kein dauerhafter Doku-Ort.
