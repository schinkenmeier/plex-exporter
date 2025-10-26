# Projektstruktur

Dieser Leitfaden beschreibt die Organisation des Plex Exporter Monorepos und erklärt den Zweck jedes Verzeichnisses.

## Übersicht

```
plex-exporter/
├── .github/              # GitHub Actions CI/CD Workflows
├── .claude/              # Claude Code Konfiguration
├── apps/                 # Anwendungen
│   ├── backend/          # Express Backend-API
│   └── frontend/         # Statische Frontend-Webanwendung
├── config/               # Runtime-Konfigurationen
│   └── frontend/         # Frontend-spezifische Konfiguration
├── data/                 # Anwendungsdaten (Single Source of Truth)
│   ├── exports/          # Plex-Exportdateien (JSON, Bilder)
│   └── sqlite/           # SQLite-Datenbanken
├── docs/                 # Dokumentation
├── packages/             # Gemeinsam genutzte Packages
│   └── shared/           # Geteilte TypeScript Types & Interfaces
├── scripts/              # Development & Maintenance Scripts
├── tools/                # User-facing Tools & Utilities
│   └── tautulli-mock/    # Mock-Server für Tautulli-Entwicklung
├── .dockerignore         # Docker Build-Kontext Ausschlüsse
├── .env.example          # Docker Compose Umgebungsvariablen Template
├── .gitignore            # Git Ignore-Regeln
├── docker-compose.yml    # Docker Compose Konfiguration
├── package.json          # Workspace-Root Package Definition
├── package-lock.json     # NPM Dependency Lock File
├── README.md             # Projekt-Hauptdokumentation
└── tsconfig.base.json    # Basis TypeScript Konfiguration

```

## Verzeichnisbeschreibungen

### Root-Verzeichnisse

#### `.github/`
GitHub Actions Workflows für Continuous Integration und Deployment.

**Inhalt:**
- Automatisierte Test-Pipelines
- Build-Validierung
- Deployment-Workflows

#### `.claude/`
Konfiguration für Claude Code AI-Assistent.

**Hinweis:** Diese Konfiguration ist projektspezifisch und sollte nicht in andere Projekte kopiert werden.

---

### `apps/` - Anwendungen

Enthält die Haupt-Anwendungen des Monorepos.

#### `apps/backend/`
Express.js Backend-API mit TypeScript.

**Struktur:**
```
backend/
├── src/
│   ├── __tests__/        # Unit & Integration Tests
│   ├── config/           # Code-level Konfiguration (Zod Schemas)
│   ├── db/               # Datenbank-Layer
│   ├── middleware/       # Express Middleware
│   ├── repositories/     # Data Access Layer
│   ├── routes/           # API Route Handler
│   ├── scripts/          # Backend-spezifische Scripts (Import, etc.)
│   ├── services/         # Business Logic Services
│   ├── createServer.ts   # Server Factory
│   └── server.ts         # Server Entry Point
├── tests/                # E2E Tests
├── .env.example          # Backend Umgebungsvariablen Template
├── Dockerfile            # Multi-stage Production Build
├── package.json          # Backend Dependencies & Scripts
├── README.md             # Backend-spezifische Dokumentation
├── SECURITY.md           # Sicherheitsrichtlinien
├── tsconfig.json         # TypeScript Konfiguration
└── vitest.config.ts      # Test-Framework Konfiguration
```

**Wichtige Umgebungsvariablen:**
- `PORT` - Server-Port (Standard: 4000)
- `SQLITE_PATH` - Pfad zur SQLite-Datenbank
- `TMDB_ACCESS_TOKEN` - TMDB API Access Token
- `API_TOKEN` - API-Authentifizierung
- `TAUTULLI_URL`, `TAUTULLI_API_KEY` - Tautulli-Integration

**Siehe auch:** [apps/backend/.env.example](../apps/backend/.env.example)

#### `apps/frontend/`
Vanilla JavaScript Frontend mit ESBuild.

**Struktur:**
```
frontend/
├── public/               # Statische Assets & HTML
│   ├── assets/           # Bilder, Icons
│   ├── dist/             # Build-Output (generiert)
│   └── index.html        # Haupt-HTML
├── src/
│   ├── core/             # Core Infrastructure (State, Config, Loader)
│   ├── features/         # Feature-Module (Filter, Grid, Hero, Modal, Watchlist)
│   ├── js/               # Utility Module & Browser-Bridges
│   ├── services/         # External Service Integrations (TMDB)
│   ├── shared/           # Shared Utilities (Cache, Stores)
│   ├── ui/               # UI Components (Loader, Toast)
│   └── main.js           # Application Bootstrap
├── scripts/
│   └── build.mjs         # ESBuild Build-Skript
├── styles/               # CSS Stylesheets
├── tests/                # Frontend Tests
└── package.json          # Frontend Dependencies & Scripts
```

**Features:**
- Offline-first Katalog
- TMDB-Integration für Metadaten
- Hero-Rotation mit Policy Engine
- Watchlist mit LocalStorage
- Modal Detail-Ansichten

---

### `config/` - Runtime-Konfigurationen

Enthält Konfigurationsdateien, die zur Laufzeit von den Anwendungen geladen werden.

**Wichtig:** Dies ist **nicht** die Code-Level-Konfiguration (siehe `apps/backend/src/config/`).

#### `config/frontend/`
Frontend Runtime-Konfiguration.

**Dateien:**
- `frontend.json` - Aktive Konfiguration (nicht im Git)
- `frontend.json.sample` - Template mit Standardwerten

**Konfigurationsoptionen:**
```json
{
  "startView": "movies",          // "movies" oder "shows"
  "tmdbEnabled": true,             // TMDB-Integration aktivieren
  "tmdbApiKey": "",                // TMDB v3 API Key (optional)
  "lang": "de",                    // Sprache für TMDB
  "features": {
    "heroPipeline": true           // Hero-Banner Feature
  }
}
```

**Build-Prozess:**
Das Frontend-Build-Skript kopiert diese Datei nach `apps/frontend/public/config/frontend.json`, sodass sie vom Browser geladen werden kann.

---

### `data/` - Anwendungsdaten

**Single Source of Truth** für alle Anwendungsdaten.

**Wichtig:**
- Dies ist das **einzige** Datenverzeichnis im Projekt
- Frühere `apps/backend/data/` und `apps/frontend/data/` wurden entfernt
- Beide Anwendungen referenzieren `../../data/` relativ

#### `data/exports/`
Plex-Exportdaten.

**Struktur:**
```
exports/
├── movies/
│   ├── movies.json                           # Film-Katalog
│   └── Movie - Titel [ID].images/            # Film-Poster & Backdrops
└── series/
    ├── series_index.json                     # Serien-Index
    ├── details/
    │   └── {ratingKey}.json                  # Serien-Detaildaten
    └── Show - Titel [ID].images/             # Serien-Poster & Episodenbilder
```

**Workflow:**
1. Exportiere Daten aus Plex/Tautulli
2. Kopiere JSON nach `data/exports/`
3. Bei Serien: Nutze `npm run split:series --workspace @plex-exporter/tools`
4. Frontend lädt automatisch die neuen Daten

#### `data/sqlite/`
SQLite-Datenbanken für das Backend.

**Dateien:**
- `plex-exporter.sqlite` - Haupt-Datenbank
- `*.sqlite-shm`, `*.sqlite-wal` - SQLite WAL-Dateien

---

### `docs/` - Dokumentation

Projekt-Dokumentation.

**Dateien:**
- [architecture.md](architecture.md) - Detaillierte Architektur-Dokumentation
- [structure.md](structure.md) - Diese Datei
- [manual-tests.md](manual-tests.md) - Manuelle Test-Szenarien

---

### `packages/` - Shared Packages

NPM Workspace Packages, die von mehreren Apps genutzt werden.

#### `packages/shared/`
Gemeinsame TypeScript Types und Interfaces.

**Exports:**
- `MediaItem`, `MediaLibrary` - Plex-Export-Datenstrukturen
- `TmdbCredentials` - TMDB-Authentifizierung
- `HealthStatus` - API Health-Check Interface

**Verwendung:**
```typescript
import type { MediaItem } from '@plex-exporter/shared';
```

---

### `scripts/` - Development Scripts

Scripts für Wartung und Entwicklung.

Derzeit keine aktiven Hilfsskripte.

**Hinweis:** Diese Scripts sind für Entwickler gedacht, nicht für Endanwender (siehe `tools/`).

---

### `tools/` - User-facing Tools

Werkzeuge, die von Endbenutzern verwendet werden.

#### `tools/tautulli-mock/`
Mock-Server für Tautulli-API-Entwicklung.

**Verwendung:**
```bash
docker-compose --profile tautulli up
```

#### Root-Level Tools
- `split_series.mjs` - Teilt große Serien-JSONs in Index + Details
- `analyze-bundle.mjs` - Analysiert Frontend-Bundle-Größe

**Verwendung:**
```bash
npm run split:series --workspace @plex-exporter/tools
npm run analyze --workspace @plex-exporter/tools
```

---

## Konfigurationsdateien

### `.dockerignore`
Schließt Dateien vom Docker Build-Kontext aus.

**Zweck:** Beschleunigt Docker Builds und reduziert Image-Größe.

### `.env.example`
Template für Docker Compose Umgebungsvariablen.

**Setup:**
```bash
cp .env.example .env
# Bearbeite .env mit deinen Werten
```

**Siehe auch:** [.env.example](../.env.example)

### `.gitignore`
Definiert Dateien, die Git ignorieren soll.

**Kategorien:**
- Dependencies (`node_modules/`)
- Build-Outputs (`dist/`, `*.tsbuildinfo`)
- Umgebungsvariablen (`.env`)
- Logs (`*.log`)
- Temporäre Dateien (`*.pid`, `nul`)
- IDE-Dateien (`.vscode/`, `.idea/`)

### `docker-compose.yml`
Orchestriert Backend, MailHog und Tautulli-Mock Services.

**Services:**
- `backend` - Backend-API (Port 4000)
- `mailhog` - SMTP-Mock für E-Mails (Port 8025)
- `tautulli-mock` - Tautulli-API-Mock (Port 8181, Profil: `tautulli`)

**Verwendung:**
```bash
docker-compose up -d
docker-compose logs -f backend
docker-compose down
```

### `package.json`
NPM Workspace Root-Konfiguration.

**Workspaces:**
- `apps/frontend`
- `apps/backend`
- `packages/shared`
- `tools`

**Verwendung:**
```bash
npm install                                    # Alle Dependencies installieren
npm run build --workspace @plex-exporter/frontend
npm run start --workspace @plex-exporter/backend
```

### `tsconfig.base.json`
Basis TypeScript-Konfiguration für alle Packages.

**Vererbung:**
```json
// apps/backend/tsconfig.json
{
  "extends": "../../tsconfig.base.json"
}
```

---

## Best Practices

### Daten
- **Immer** `data/` als einzige Datenquelle verwenden
- Keine Daten in `apps/*/data/` ablegen
- Export-Pfade relativ zu `data/exports/` referenzieren

### Konfiguration
- **Runtime-Config:** `config/frontend/` oder ENV-Variablen
- **Code-Config:** `apps/*/src/config/`
- Keine Secrets in Git committen (`.env`, Tokens)

### Build-Artefakte
- Build-Outputs sind in `.gitignore`
- Docker ignoriert Development-Files via `.dockerignore`
- Logs und PID-Files werden nicht committed

### Docker
- Multi-stage Builds für kleine Production Images
- `.env.example` als Template bereitstellen
- Healthchecks für alle Services definieren

---

## Migration von alter Struktur

Falls du von einer älteren Version migrierst:

### Datenverzeichnisse
```bash
# Alte Struktur (deprecated)
apps/backend/data/exports/
apps/frontend/data/

# Neue Struktur
data/exports/              # Verschiebe Daten hierhin
```

### Konfiguration
```bash
# Alte Struktur
config/frontend.json       # Root-Level

# Neue Struktur
config/frontend/frontend.json
```

### Environment Files
```bash
# Entfernt
apps/backend/.env.sample   # Veraltet

# Beibehalten
apps/backend/.env.example  # Backend-spezifisch
.env.example               # Docker Compose
```

---

## Weitere Ressourcen

- [README.md](../README.md) - Projektübersicht und Quick-Start
- [architecture.md](architecture.md) - Detaillierte Architektur
- [apps/backend/README.md](../apps/backend/README.md) - Backend-Dokumentation
- [apps/backend/SECURITY.md](../apps/backend/SECURITY.md) - Sicherheitsrichtlinien
