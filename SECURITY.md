# Security Policy

## Verantwortung
Dieses Repository enthält öffentliche Frontend- und API-Flächen, eine geschützte Admin-Oberfläche sowie optionale Integrationen für Tautulli, TMDB und Resend. Sicherheitsrelevante Probleme sollen verantwortungsvoll und nicht öffentlich zuerst als Bugreport im Code gemischt behandelt werden.

## Bitte melden
- Authentifizierungs- oder Autorisierungsfehler
- Leaks von Tokens, Schlüsseln oder Passwörtern
- unsichere Standardkonfigurationen
- CORS-, CSP- oder Header-Fehlkonfigurationen
- Probleme rund um Admin-Routen, Tautulli-Sync oder Datenpersistenz

## Operative Sicherheitsgrundsätze
- Keine Secrets in Git committen.
- `ADMIN_USERNAME` und `ADMIN_PASSWORD` immer gemeinsam setzen.
- `TAUTULLI_URL` und `TAUTULLI_API_KEY` immer gemeinsam setzen.
- `RESEND_API_KEY` und `RESEND_FROM_EMAIL` immer gemeinsam setzen.
- Root-`.env`, `apps/backend/.env` und Unraid-`.env` bleiben lokal.
- Bei öffentlicher Exposition von `/api/*` muss vorgeschalteter Schutz bewusst konfiguriert werden; `/admin/*` bleibt getrennt abgesichert.

## Technische Hinweise
- Das Backend setzt Sicherheitsheader über Helmet und verwendet Rate Limiting für API- und Hero-Endpunkte.
- Docker-/Cloudflare-Setups dürfen nur die nötigen öffentlichen Pfade freigeben.

## Weitere Doku
- `docs/operations/cloudflare.md`
- `docs/reference/environment-variables.md`
- `docs/development/backend.md`
