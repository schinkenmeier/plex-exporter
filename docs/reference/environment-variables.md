# Referenz: Umgebungsvariablen

## Root-`.env` für Docker Compose
| Variable | Zweck |
| --- | --- |
| `BACKEND_DATA_PATH` | Host-Pfad für `/app/data` |
| `CADDY_DATA_PATH` | Host-Pfad für Caddy-Daten |
| `CADDY_CONFIG_PATH` | Host-Pfad für Caddy-Konfiguration |
| `BACKEND_NODE_ENV` | setzt `NODE_ENV` im Backend-Container |
| `BACKEND_INTERNAL_PORT` | interner Backend-Port |
| `BACKEND_SQLITE_PATH` | SQLite-Pfad im Container |
| `BACKEND_API_TOKEN` | optionales Token für geschützte API-Nutzung |
| `BACKEND_ADMIN_USERNAME` | Admin-Basic-Auth Benutzer |
| `BACKEND_ADMIN_PASSWORD` | Admin-Basic-Auth Passwort |
| `BACKEND_HERO_POLICY_PATH` | optionaler Backend-Override für Hero-Policy |
| `BACKEND_TMDB_ACCESS_TOKEN` | optionaler TMDB-Token |
| `BACKEND_RESEND_API_KEY` | optionaler Resend-Key |
| `BACKEND_RESEND_FROM_EMAIL` | optionale Resend-Absenderadresse |
| `BACKEND_TAUTULLI_URL` | optionale Tautulli-Basis-URL |
| `BACKEND_TAUTULLI_API_KEY` | optionaler Tautulli-Key |
| `TAUTULLI_HTTP_PORT` | Port für das Mock-Profil |
| `CADDY_HTTP_PORT` | Host-Port für HTTP |
| `CADDY_HTTPS_PORT` | Host-Port für HTTPS |

## Unraid-Zusatz
| Variable | Zweck |
| --- | --- |
| `IMAGE_TAG` | GHCR-Tag für `docker-compose.images.yml` |

## `apps/backend/.env` für lokale Source-Runs
| Variable | Zweck |
| --- | --- |
| `NODE_ENV` | Laufzeitmodus |
| `PORT` | lokaler Backend-Port |
| `SQLITE_PATH` | SQLite-Datei für Source-Runs |
| `API_TOKEN` | optionales Token |
| `ADMIN_USERNAME` | optionaler Admin-Benutzer |
| `ADMIN_PASSWORD` | optionales Admin-Passwort |
| `TMDB_ACCESS_TOKEN` | optionaler TMDB-Token |
| `TAUTULLI_URL` | optionale Tautulli-URL |
| `TAUTULLI_API_KEY` | optionaler Tautulli-Key |
| `RESEND_API_KEY` | optionaler Resend-Key |
| `RESEND_FROM_EMAIL` | optionale Absenderadresse |
| `HERO_POLICY_PATH` | optionaler Pfad für Hero-Policy |

## Paarregeln
- `ADMIN_USERNAME` und `ADMIN_PASSWORD` nur gemeinsam
- `TAUTULLI_URL` und `TAUTULLI_API_KEY` nur gemeinsam
- `RESEND_API_KEY` und `RESEND_FROM_EMAIL` nur gemeinsam
