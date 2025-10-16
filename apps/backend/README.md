# Plex Exporter Backend

Dieses Paket stellt das Fundament für eine künftige API bereit, die Plex-Exports über HTTP verfügbar macht. Ziel ist es, vorbereitete JSON-Dumps aus `data/exports/` strukturiert auszuliefern, sie optional aufzubereiten und zukünftige Verwaltungsaufgaben (z. B. Re-Exports, Validierungen, Authentifizierung) zu übernehmen.

## Aktueller Stand
- Ein Express-Server (`src/server.ts`) mit vorbereiteten Routen, CORS-Konfiguration und gemeinsamer Middleware.
- **Neue Export-API** (`src/routes/exports.ts`) mit folgenden Endpunkten:
  - `GET /api/exports/movies` - Liefert vollständige Filmdaten aus `data/exports/movies/movies.json`
  - `GET /api/exports/series` - Liefert Serien-Index aus `data/exports/series/series_index.json`
  - `GET /api/exports/series/:id/details` - Liefert detaillierte Serieninformationen
  - `GET /api/exports/stats` - Liefert Statistiken über verfügbare Exporte
- Health-Endpunkt unter `/health` für Betriebsprüfungen
- SQLite-Datenbank mit Migrations-System und Repositories für Media, Thumbnails und Tautulli-Snapshots
- Platzhalter für automatisierte Tests (`tests/`)

## Konfiguration
Die Anwendung liest ihre Konfiguration beim Start aus Umgebungsvariablen und validiert sie per [Zod](https://github.com/colinhacks/zod). Erstelle für lokale Entwicklungen eine `.env`-Datei auf Basis der bereitgestellten `.env.sample` und passe die Werte an deine Umgebung an.

| Variable | Beschreibung | Pflicht? | Standardwert |
| --- | --- | --- | --- |
| `NODE_ENV` | Node.js-Laufzeitmodus. | Nein | `development` |
| `PORT` | HTTP-Port, auf dem der Server lauscht. | Nein | `4000` |
| `SQLITE_PATH` | Pfad zur SQLite-Datenbank mit den Exportinformationen. | Nein | `./data/exports/plex-exporter.sqlite` |
| `SMTP_HOST` | Hostname des SMTP-Servers. Wird benötigt, sobald E-Mail-Versand aktiviert wird. | Bedingt¹ | – |
| `SMTP_PORT` | Port des SMTP-Servers. | Bedingt¹ | – |
| `SMTP_USER` | Benutzername für den SMTP-Login. | Nein | – |
| `SMTP_PASS` | Passwort bzw. App-Token für den SMTP-Login. | Nein | – |
| `SMTP_FROM` | Absender-Adresse für E-Mails. | Bedingt¹ | – |
| `SMTP_SECURE` | Ob eine TLS-gesicherte Verbindung (`true`/`false`) genutzt werden soll. | Nein | `false` |
| `TAUTULLI_URL` | Basis-URL der Tautulli-Instanz. | Bedingt² | – |
| `TAUTULLI_API_KEY` | API-Key für Zugriffe auf Tautulli. | Bedingt² | – |
| `API_TOKEN` | Geheimer Token für geschützte Routen (`Bearer`- oder `X-API-Key`-Header). | Nein | – |

¹ `SMTP_HOST`, `SMTP_PORT` und `SMTP_FROM` müssen gemeinsam gesetzt werden, sobald SMTP genutzt werden soll.

² `TAUTULLI_URL` und `TAUTULLI_API_KEY` müssen gemeinsam gesetzt werden, sobald eine Integration aktiv ist.

## Build & Betrieb mit Docker

### Produktionsbuild erstellen
- Lokaler Build ohne Container: `npm run build --workspace @plex-exporter/backend`
- Der Build erzeugt ein transpiliertes Bundle unter `apps/backend/dist/` und nutzt das neue Skript `start:prod`, um den Server via `node dist/server.js` zu starten.

### Lokale Umgebung mit Docker Compose
- Docker-Image bauen: `docker compose build backend`
- Backend & Mailhog starten: `docker compose up -d backend mailhog`
- Optionales Tautulli-Mock aktivieren: `docker compose --profile tautulli up -d backend tautulli-mock`
  (liefert eine kleine statische Antwort aus `tools/tautulli-mock/server.cjs`).
- Logs einsehen: `docker compose logs -f backend`
- Umgebung stoppen: `docker compose down`

### Persistente Daten & Volumes
- Exporte (`data/exports/`) werden als Bind-Mount in den Container eingebunden und bleiben auf dem Host erhalten.
- Die SQLite-Datenbank liegt standardmäßig unter `data/sqlite/plex-exporter.sqlite`. Lege den Ordner einmalig an (`mkdir -p data/sqlite`), damit Docker Compose die Datei persistent ablegen kann.
- In `.gitignore` sind sowohl `data/sqlite/` als auch `*.sqlite` im Export-Verzeichnis ausgeschlossen, damit keine Laufzeitdaten eingecheckt werden.

### Migrationen & Initialisierung
- Beim Containerstart wird `npm run start:prod` ausgeführt, wodurch der Server automatisch alle hinterlegten SQLite-Migrationen anwendet (`apps/backend/src/db/migrations/`). Manuelle Eingriffe sind nicht notwendig.

### Environment-Variablen in Docker Compose
- Die Compose-Datei akzeptiert über `.env` im Projektwurzelverzeichnis verschiedene Parameter (`BACKEND_PORT`, `BACKEND_INTERNAL_PORT`, `BACKEND_SQLITE_PATH`, `BACKEND_SMTP_*`, `BACKEND_TAUTULLI_*`).
- Standardmäßig lauscht das Backend auf Port `4000`, SMTP-Aufrufe werden an den `mailhog`-Container weitergeleitet (`SMTP_HOST=mailhog`, `SMTP_PORT=1025`).
- Für die Nutzung des Tautulli-Mocks setze `BACKEND_TAUTULLI_URL=http://tautulli-mock:8181/api/v2` sowie einen beliebigen `BACKEND_TAUTULLI_API_KEY`, damit die Validierung greift.

## Nächste Schritte
- Anbindung an reale Exportdaten aus `data/exports/`.
- Ergänzung weiterer Routen (z. B. `/movies`, `/shows`).
- Konfiguration von Logging, Fehlerbehandlung und Authentifizierung.
- Erweiterung der Test-Suite (Unit-, Integrations- und Contract-Tests).

## Schnellstart (Lokale Entwicklung)

1. **Dependencies installieren**:
   ```bash
   npm install --workspace @plex-exporter/backend
   ```

2. **Umgebungsvariablen konfigurieren**:
   ```bash
   cd apps/backend
   cp .env.example .env
   # Passe .env nach Bedarf an (PORT=4001 für lokale Entwicklung)
   ```

3. **TypeScript kompilieren**:
   ```bash
   npm run build --workspace @plex-exporter/backend
   ```

4. **Server starten**:
   ```bash
   npm run start --workspace @plex-exporter/backend
   # Oder für Development mit Auto-Reload:
   npm run dev --workspace @plex-exporter/backend
   ```

5. **API testen**:
   ```bash
   curl http://localhost:4001/health
   curl http://localhost:4001/api/exports/stats
   curl http://localhost:4001/api/exports/movies
   ```

## API-Endpunkte

### Export-Daten (Public, mit CORS)

- **`GET /api/exports/stats`**
  Liefert Statistiken über verfügbare Exporte

- **`GET /api/exports/movies`**
  Liefert vollständige Filmdaten aus `data/exports/movies/movies.json`

- **`GET /api/exports/series`**
  Liefert Serien-Index aus `data/exports/series/series_index.json`

- **`GET /api/exports/series/:id/details`**
  Liefert detaillierte Serieninformationen (inklusive Staffeln & Episoden)

### System

- **`GET /health`**
  Health-Check mit Status, Timestamp und Environment

### Authentifizierung für geschützte Routen

- **`POST /notifications/*`** und **`GET /libraries`** erwarten, dass du entweder einen `Authorization: Bearer <TOKEN>`-Header
  oder alternativ `X-API-Key: <TOKEN>` mitsendest. Der Token-Wert wird über die Umgebungsvariable `API_TOKEN` konfiguriert.
- Ist kein `API_TOKEN` gesetzt, bleiben die Routen weiterhin ohne Authentifizierung erreichbar (z. B. für lokale Tests).
