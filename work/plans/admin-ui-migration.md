# Admin-UI Migration – Bestandsaufnahme & Zielbild

## Ist-Zustand

- **Monolithische HTML-Datei**: `apps/backend/src/views/admin.html` bündelt Layout, Styles (~1.600 Zeilen CSS), Markup (Dashboard, Config, Logs, DB, Tautulli, Diagnostics) und die komplette Steuerlogik (~1.500 Zeilen JS) ohne Build-Schritt.
- **Globale Zustände & DOM-Lookups**: Ein großes `elements`- und `state`-Objekt steuert sämtliche Bereiche; Lifecycle-Isolation fehlt, wodurch Fehler view-übergreifend wirken können.
- **Ad-hoc Utilities**: `fetchJson`, Toasts, Intervalle, Formatierungen sind lokal implementiert; einige Features umgehen die gemeinsamen Helfer und nutzen Hardcoded-URLs.
- **UI-Inkonsistenzen**: Mischsprache (EN/DE), wiederholte DOM-Strings für Karten, Panels und Info-Listen; es gibt keine gemeinsame Komponentenbibliothek.
- **Kein Tooling**: Da alles inline eingebettet ist, fehlen TypeScript, Linting, Unit- oder Integrationstests und ein Build-/Deploy-Prozess.

## Feature-Inventar

| View-ID            | Funktionalität                                                                                           | Besondere Logik |
|--------------------|----------------------------------------------------------------------------------------------------------|-----------------|
| `view-dashboard`   | Statistiken (Medien, DB, Laufzeit), System-/Service-Status, Serienbeispiele                               | Periodisches Polling (`DASHBOARD_INTERVAL`) |
| `view-config`      | TMDb-Token, Resend-Mail, Watchlist-Admin, Welcome-Mails, Konfig-Snapshot                                  | Mehrere Formular-Flows + History-Listen |
| `view-logs`        | Runtime-Logs filtern, suchen, paginieren, Limit wählen, Pufferclear                                      | Hilfsfunktionen für Level/Limit/Offset/Q/Refresh |
| `view-database`    | Tabellenliste, Filter (PK, Datum, Enum/Null), Such-/Sortier-/Pagination, Tabellendarstellung             | Umfangreichste State-Maschine |
| `view-tautulli-sync` | Verbindung, Bibliotheksauswahl, manueller/automatischer Sync, Snapshot-Limit                            | Mehrere Fetch-Endpunkte + Checkbox-Optionen |
| `view-diagnostics` | Tests für Tautulli, DB, TMDB, Resend und Batch-Diagnose                                                  | Einzel- und Sammel-API-Trigger |
| `view-watchlist-requests` | Watchlist-Anfragen, Status, Historie, Notizen, Reply-Mail und Summary                           | Request-Paket bleibt Backend-Modell |

Gemeinsame Services: Toasts, Auto-Refresh, Fetch/Fehlerbehandlung, Datum-/Zahlenformatierung, lokale Speicherung (`localStorage` für Auto-Refresh).

## Zielbild

### Struktur im Frontend-Workspace

```
apps/frontend/src/admin/
├─ core/
│  ├─ api.ts              # typisierte Wrapper auf /admin/api-Endpoints
│  ├─ state.ts            # zentraler Store (z. B. Zustand & Events je View)
│  ├─ services/
│  │   ├─ toast.ts
│  │   ├─ loader.ts
│  │   └─ polling.ts
├─ components/
│  ├─ Card.ts
│  ├─ Panel.ts
│  ├─ InfoList.ts
│  └─ DataTable.ts
├─ views/
│  ├─ dashboard.ts
│  ├─ config.ts
│  ├─ logs.ts
│  ├─ database/
│  │   ├─ explorer.ts
│  │   └─ filters.ts
│  ├─ tautulli.ts
│  └─ diagnostics.ts
├─ styles/
│  └─ admin.css
└─ main.ts
```

- **Entry-Point (`main.ts`)** orchestriert Navigation, Auth-Gate und globale Services.
- **Feature-Module** kapseln Logik & Rendering pro View (Mount/Unmount/Refresh-Schnittstelle).
- **Komponenten-Layer** vermeidet String-Konkatenation und erleichtert Tests/Wiederverwendung.
- **Typisierte API-Schicht** nutzt gemeinsame Typen aus `@plex-exporter/shared` (ggf. Ergänzung um Admin-spezifische Interfaces).

### Build & Deploy

- Neuer Build-Target (z. B. `npm run build:admin`) erzeugt Assets unter `apps/frontend/dist/admin`.
- Backend-Route `/admin` liefert gebaute Dateien; statische Assets werden aus `apps/backend/dist/public/admin` bereitgestellt (kopiert im Build-Skript oder via symlink).
- Dev-Server: Proxy `/admin/api/*` auf Express-Backend, eigener HTML-Entry (`public/admin.html` oder Template-Generation via esbuild).

### Technische Leitplanken

- Verwendung von ES-Modulen + TypeScript (analog Frontend).
- Gemeinsames Designsystem (Buttons, Chips, Karten) aus vorhandenen UI-Bausteinen oder neuen Komponenten, die auch im öffentlichen Frontend nutzbar sind.
- Unit-Tests pro Feature (z. B. Datenbank-Filterlogik, Scheduler-Formulare) und Integrationstests (Smoke-Test „Dashboard lädt“, „Tabellen-Paging funktioniert“).

Mit dieser Zielarchitektur können Backend-Änderungen (neue Admin-APIs) gegen klar definierte Clients entwickelt und getestet werden, während zukünftige UI-Anpassungen von der bestehenden Frontend-Infrastruktur profitieren.

## UI-Bausteine & Utilities (Zwischenstand)

- **Grundlayout & Styles**: `apps/frontend/src/admin/core/app.ts` erzeugt das Shell-Layout, die dazugehörigen Styles (Sidebar, Header, Cards, Panels, Loader, Toasts) liegen in `styles/admin.css`.
- **Komponenten**: Wiederverwendbare Bausteine wie Cards/Panels (`components/card.ts`), Info-Listen (`components/infoList.ts`) und Kennzahlen-Karten (`components/metricCard.ts`) kapseln Struktur & Semantik.
- **Services**: Toast-Service (`core/services/toast.ts`) und Loader-Service (`core/services/loader.ts`) stehen allen Views über den `ViewContext` zur Verfügung und erlauben konsistente Benutzerführung.
- **Platzhalter-Views**: Bis zur vollständigen Migration rendern die Views strukturierte Platzhalter auf Basis der neuen Komponenten, wodurch Layout & Navigation schon getestet werden können.
- **API-Client**: `core/api.ts` bündelt typisierte Methoden für Dashboard-, Konfigurations-, Log-, Datenbank-, Tautulli-, Diagnostics-, Profile- und Watchlist-Request-Endpunkte und bildet damit die Grundlage für die anstehenden Feature-Migrationen.

## Feature-Portierung (Fortschritt)

- ✅ **Dashboard** (`views/dashboard/index.ts`): Aggregiert `/status`, `/stats`, `/config`, stellt Metriken, System-/Service-Status, Serienbeispiele sowie Auto-Refresh bereit und ersetzt damit die ursprüngliche Inline-Implementierung in `admin.html`.
- ✅ **Konfiguration** (`views/config/index.ts`): TMDb-, Resend- und Watchlist-Formulare plus Welcome-Mail-Workflow (inkl. Statistik, Historie & Aktionen) sowie den Konfigurationssnapshot wurden modularisiert und nutzen den typisierten API-Client.
- ✅ **Logs** (`views/logs/index.ts`): Level-/Limit-Filter, Refresh- und Clear-Aktion nutzen `adminApiClient.getLogs/clearLogs` und zeigen Einträge mit Kontext in einer eigenen Card. Backend und Client unterstützen zusätzlich `q`, `offset`, Pagination-Metadaten und newest-first-Sortierung.
- ✅ **Datenbank-Explorer** (`views/database/index.ts`): Tabellenliste, Spaltenselektion, Primärschlüssel-/Datums-/Enum-/NULL-Filter, Suche, Sortierung und Pagination greifen vollständig auf die neuen Komponenten & Styles zurück.
- ✅ **Tautulli Sync** (`views/tautulli/index.ts`): Verbindung, Bibliotheken, manueller Sync, Zeitpläne und Snapshot-Limits sind auf Frontend-Seite modularisiert; alle `/admin/api/tautulli/*`-Routen sind über den typisierten Client erreichbar.
- ✅ **Diagnostics** (`views/diagnostics/index.ts`): Schnelle Tests für Tautulli, Datenbank und Resend bündelt die bestehenden Diagnose-Endpunkte in einer separaten Ansicht. Backend-seitig steht zusätzlich `POST /admin/api/diagnostics/run` für Batch-Diagnosen bereit.
- ✅ **Admin Meta**: `/admin/api/profile` liefert minimale Profilmetadaten für das redesigned Header-/Account-UI.
- ✅ **Watchlist Requests Backend**: Anfrage-Liste, Detail, Summary, Statuswechsel mit Kommentar, Admin-Notiz, Reply-Mail und feste Reply-Templates sind als Admin-API vorhanden; eine eigenständige neue UI-Ansicht kann darauf aufbauen.
- ✅ **Integrationstests** (`apps/backend/tests/routes/*.integration.test.ts`): DB-Paging-/TMDb-Flows sowie Tautulli-Sync/Manual-Sync werden über Supertest+Vitest gegen die Express-Router geprüft und laufen mit `npm run test --workspace @plex-exporter/backend`.
- ✅ **Asset-Auslieferung**: `createServer.ts` richtet `/dist` als statisches Verzeichnis ein, sodass `public/dist/admin.{js,css}` direkt vom Backend bedient werden und die neue Oberfläche auch in Containern/Prod geladen wird.
- 🧹 **Legacy entfernt**: Die frühere `src/views/admin.html` wurde gestrichen – `/admin` setzt jetzt zwingend auf den gebauten Frontend-Output, andernfalls startet das Backend mit einem klaren Fehlerhinweis.
