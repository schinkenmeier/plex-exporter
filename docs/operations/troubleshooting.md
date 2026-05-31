# Troubleshooting

## Backend ist unhealthy

- Logs prüfen: `docker compose logs backend`.
- Healthcheck direkt prüfen: `/health`.
- `BACKEND_SQLITE_PATH` und `BACKEND_DATA_PATH` prüfen.
- Sicherstellen, dass der Container in `/app/data/sqlite` schreiben kann.

## Lokaler Backend-Start bricht wegen Admin-Assets ab

Vorher bauen:

```bash
npm run build --workspace @plex-exporter/frontend
```

Das Backend erwartet `apps/frontend/public/admin.html` und `apps/frontend/public/dist`.

## Lokale Tests scheitern mit `better_sqlite3.node`

Die lokale native Abhängigkeit passt nicht zur aktiven Node-Version.

```bash
npm ci
npm rebuild better-sqlite3 --workspace @plex-exporter/backend
```

Node `24.x` verwenden.

## Katalog zeigt keine Daten

- Admin-UI unter `/admin` prüfen.
- Tautulli-Konfiguration und Verbindung prüfen.
- Ausgewählte Library Sections prüfen.
- Letzten manuellen oder geplanten Sync prüfen.
- SQLite-Datei und freigegebene Tabellen über die Admin-Datenbankansicht prüfen. Der Explorer zeigt nur allowlisted Tabellen; interne Tabellen, Secrets und personenbezogene Daten sind bewusst ausgeblendet.

## Bilder oder Thumbnails fehlen

- `/api/thumbnails/*` extern erreichbar machen.
- Bei lokalen Cover-, Movie- und Series-Dateien Daten-Mount und `exports`-Pfad prüfen.
- Bei Tautulli-Bildern URL/API-Key und Netzwerkzugriff prüfen. Der Tautulli-Proxy unter `/api/thumbnails/tautulli/*` braucht keinen lokalen `exports`-Pfad.

## Frontend lädt HTML statt JSON

- Caddy-/Cloudflare-Regeln prüfen.
- `/config/*.json` und `/*.json` dürfen nicht auf `index.html` oder Login-Seiten fallen.
- Direkt testen: `/config/frontend.json`, `/api/v1/movies`, `/health`.

## Admin/Auth wirkt falsch

- `ADMIN_USERNAME` und `ADMIN_PASSWORD` müssen gemeinsam gesetzt sein.
- Env-Werte haben Vorrang vor DB-gespeicherten Admin-/Integrationswerten.
- Bei Tautulli, TMDB und Resend zeigen Status-Antworten aktive Quelle und gespeicherte Werte getrennt an; `saved` kann gesetzt sein, auch wenn Env aktiv ist.
- `/libraries` ist separat über `API_TOKEN` geschützt, wenn gesetzt.

## Weiterführend

- Cloudflare: [cloudflare.md](cloudflare.md)
- Pfade: [../reference/runtime-paths.md](../reference/runtime-paths.md)
- Konfiguration: [../reference/configuration.md](../reference/configuration.md)
