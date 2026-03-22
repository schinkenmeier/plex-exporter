# Betrieb: Cloudflare und vorgeschalteter Zugriffsschutz

## Ziel
Wenn Plex Exporter hinter Cloudflare Access oder Zero Trust betrieben wird, müssen API- und Konfigurationspfade erreichbar bleiben, während die eigentliche Benutzeroberfläche und insbesondere `/admin` bewusst geschützt werden können.

## Typisch freizugebende Pfade
- `/api/*`
- `/config/*`
- `/health`
- `/*.json`

## Warum das wichtig ist
- Das Frontend lädt Daten über `/api/v1/*`
- Bilder laufen über `/api/thumbnails/*`
- Runtime-Konfiguration kommt aus `/config/frontend.json`
- weitere JSON-Dateien wie Hero-Policy oder Manifest dürfen nicht vom SPA-Fallback oder einem Login-Redirect verdeckt werden

## Was geschützt bleiben soll
- `/admin/*`
- optional weitere interne oder debugnahe Oberflächen

## Symptome bei Fehlkonfiguration
- API-Calls landen auf einer Login-Seite
- Bilder liefern 520/HTML statt Bilddaten
- `frontend.json` liefert HTML statt JSON

## Prüfpunkte
- direkter Aufruf von `/api/v1/movies`
- direkter Aufruf von `/config/frontend.json`
- Healthcheck über die externe URL
