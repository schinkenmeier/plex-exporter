# Referenz: Konfigurationsmodell

## Backend
Das Backend liest Konfiguration aus zwei Ebenen:
1. Umgebungsvariablen
2. gespeicherte Werte in der Datenbank für ausgewählte Integrationen

### Vorrang
- ENV gewinnt vor Datenbankwerten.
- Datenbankwerte dienen als persistente Betriebswerte für Admin-Workflows.

## Frontend
Das Frontend lädt seine Runtime-Konfiguration beim Start als JSON.

### Relevante Orte
- Template: `apps/frontend/config/frontend.json.sample`
- erzeugte Runtime-Datei: `apps/frontend/public/config/frontend.json`

### Relevante Inhalte
- `startView`
- `lang`
- `features.*`

## Admin-UI und gespeicherte Betriebswerte
Die Admin-Oberfläche kann unter anderem Werte für folgende Integrationen in der Datenbank halten:
- TMDB
- Resend
- Tautulli
- Watchlist-Admin-E-Mail

## Hero-Policy
- Standarddatei: `apps/frontend/public/hero.policy.json`
- optionaler Override im Backend über `HERO_POLICY_PATH`
