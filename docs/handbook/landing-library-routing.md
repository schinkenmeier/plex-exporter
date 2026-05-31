# Landing und Library Routing

## Zweck

`/` ist das Portal für den Einstieg in Plex Exporter. Die Seite darf von Claude Design visuell ersetzt werden, soll technisch aber nur navigieren und keine Authentifizierung simulieren.

## Routen

- `/`: Portal/Landingpage.
- `/library`: öffentliche Medien-Library.
- `/admin`: geschützter Admin-Bereich mit bestehendem Basic-/Bearer-Auth-Flow.

## Stabile Landing-Hooks

- `body[data-page="portal"]`: Root-Marker der Portal-Seite.
- `#portalRoot`: Portal-Container.
- `.portal-actions`: Navigationsbereich.
- `[data-portal-target="library"]`: Link zur Library.
- `[data-portal-target="admin"]`: Link zum Admin-Bereich.
- `[data-future-auth="placeholder"]`: Platzhalter für späteren Login-/Rollen-Ausbau.

## Grenzen

- Die Landingpage ruft keine Auth-API auf.
- Es gibt keine Login-Felder, Session-Logik oder Rollenanzeige.
- Public APIs bleiben unter `/api/v1/*`, `/api/hero/*`, `/api/thumbnails/*`, `/api/watchlist/*` und `/api/newsletter/*`.
- Admin APIs bleiben unter `/admin/api/*`.
- Alte Root-Deep-Links wie `/#/movie/...` werden nicht automatisch nach `/library` migriert.
