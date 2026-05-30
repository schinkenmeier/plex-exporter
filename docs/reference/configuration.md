# Konfiguration

## Ebenen

Das Backend liest Konfiguration aus:

1. Umgebungsvariablen
2. gespeicherten SQLite-Werten für ausgewählte Integrationen

Env-Werte haben Vorrang. Das ist besonders relevant für Tautulli, TMDB und Resend: Werte aus der Admin-UI können gespeichert sein, aber durch Env überschrieben werden. Status-Antworten melden dann den Env-Override explizit.

## Backend-Env

Lokaler Source-Run nutzt [../../apps/backend/.env.example](../../apps/backend/.env.example). Docker Compose nutzt Root-[../../.env.example](../../.env.example), dessen `BACKEND_*`-Variablen auf Backend-Env gemappt werden.

Wichtige Gruppen:

- Server: `NODE_ENV`, `PORT`
- Datenbank: `SQLITE_PATH`
- Auth: `API_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_API_TOKEN`
- Admin-Auslieferung: `ADMIN_UI_MODE`
- Integrationen: `TAUTULLI_URL`, `TAUTULLI_API_KEY`, `TMDB_ACCESS_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- Jobs: `SCHEDULER_TIMEZONE`, `TZ`
- Hero: `HERO_POLICY_PATH`

Die vollständige Liste steht in [environment-variables.md](environment-variables.md).

## Paarregeln

Diese Werte müssen gemeinsam gesetzt werden:

- `ADMIN_USERNAME` und `ADMIN_PASSWORD`
- `TAUTULLI_URL` und `TAUTULLI_API_KEY`
- `RESEND_API_KEY` und `RESEND_FROM_EMAIL`

## Frontend-Runtime-Konfiguration

- Template: [../../apps/frontend/config/frontend.json.sample](../../apps/frontend/config/frontend.json.sample)
- Build-Ziel: `apps/frontend/public/config/frontend.json`
- Geladene URL im Browser: `/config/frontend.json`

Der Build kopiert zuerst ein vorhandenes `frontend.json`, sonst das Sample. Kandidaten liegen in `apps/frontend/config/` und optional in einem nicht versionierten Root-`config/frontend/`.

## Hero-Policy

- Standard: [../../apps/frontend/public/hero.policy.json](../../apps/frontend/public/hero.policy.json)
- Backend-Override: `HERO_POLICY_PATH`

Die Hero-Pipeline sucht zusätzlich typische Source-Run-Pfade, wenn kein Override gesetzt ist.

## Admin-UI

`ADMIN_UI_MODE` steuert, ob das Backend die gebaute Admin-UI mit ausliefert:

- `embedded` (Standard): `/admin` und `/dist` benötigen die Frontend-Build-Artefakte.
- `api-only`: Das Backend startet ohne Frontend-Build und stellt nur API-Flächen bereit.

Die Admin-UI kann Betriebswerte für Tautulli, TMDB, Resend und Watchlist-E-Mail speichern. Tautulli nutzt die Tabelle `tautulli_config` als aktuelle Persistenz; alte `settings`-Einträge sind nur Legacy-Fallback.

Tautulli-, TMDB- und Resend-Änderungen aus der Admin-UI werden zur Laufzeit neu angewendet. Speichern aktiviert die jeweilige Integration ohne Neustart; Löschen deaktiviert sie oder fällt auf Env-Konfiguration zurück. TMDB aktualisiert dabei auch die Hero-Pipeline, den Tautulli-Sync und den TMDB-Cache der `/api/v1/*`-Routen.

TMDB und Resend nutzen Env vor Datenbank. Ein gespeicherter DB-Wert bleibt gespeichert, ist aber nicht aktiv, solange die passende Env-Konfiguration gesetzt ist. Status-Antworten trennen deshalb aktive Quelle und gespeicherten Wert: Felder wie `source`, `fromEnv`, `envOverride` beschreiben die aktive Konfiguration, `saved` beschreibt vorhandene DB-Werte.
