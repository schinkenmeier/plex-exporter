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
- Auth: `API_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`
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

Die Admin-UI kann Betriebswerte für Tautulli, TMDB, Resend und Watchlist-E-Mail speichern. Tautulli nutzt die Tabelle `tautulli_config` als aktuelle Persistenz; alte `settings`-Einträge sind nur Legacy-Fallback.

Resend-Änderungen aus der Admin-UI werden zur Laufzeit neu angewendet: Speichern aktiviert den Mail-Sender ohne Neustart, Löschen deaktiviert ihn oder fällt auf Env-Konfiguration zurück. TMDB nutzt ebenfalls Env vor Datenbank; ein gespeicherter Token bleibt gespeichert, ist aber nicht aktiv, solange `TMDB_ACCESS_TOKEN` gesetzt ist.
