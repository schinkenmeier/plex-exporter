# Cloudflare Zero Trust Setup für Plex Exporter

## Übersicht

Diese Anleitung zeigt, wie du Cloudflare Zero Trust konfigurierst, damit dein Plex Exporter öffentlich über einen Cloudflare Tunnel erreichbar ist.

## Voraussetzungen

- Cloudflare Account mit einer eigenen Domain
- Cloudflare Zero Trust aktiviert (kostenlos für bis zu 50 Nutzer)
- Plex Exporter läuft auf Unraid (oder einem anderen Server)
- Cloudflare Tunnel ist bereits eingerichtet

## Problem: API-Anfragen werden blockiert

Standardmäßig schützt Cloudflare Zero Trust **alle** Anfragen mit Authentifizierung. Das bedeutet:
- Frontend (HTML/CSS/JS) → ✅ Geschützt (erfordert Login)
- API-Anfragen (`/api/*`) → ❌ Blockiert (wird zur Login-Seite umgeleitet)
- Bilder (`/api/thumbnails/*`) → ❌ Blockiert
- Config-Dateien (`/config/*`) → ❌ Blockiert

**Resultat:** Das Frontend lädt, aber zeigt keine Daten, da alle API-Calls abgefangen werden.

## Lösung: Bypass-Regeln für API-Pfade

Wir müssen bestimmte Pfade von der Authentifizierung ausnehmen, damit das Frontend die Daten laden kann.

### Schritt 1: Cloudflare Zero Trust Dashboard öffnen

1. Gehe zu [https://one.dash.cloudflare.com/](https://one.dash.cloudflare.com/)
2. Wähle dein Team/Account aus
3. Navigiere zu **Access → Applications**

### Schritt 2: Deine Application finden

1. Suche nach deiner Application (z.B. `katalog.dinspel.eu`)
2. Klicke auf **"Edit"** oder **"Configure"**

### Schritt 3: Bypass-Regeln hinzufügen

Du hast zwei Möglichkeiten:

#### Option A: Separate Application für API (Empfohlen)

Erstelle eine **zweite Application** nur für API-Pfade:

1. **Add an application** → **Self-hosted**
2. **Application name:** "Plex Exporter API"
3. **Application domain:**
   - Subdomain: `katalog` (deine Subdomain)
   - Domain: `dinspel.eu` (deine Domain)

4. **Add paths:**
   - `/api/*`
   - `/api/thumbnails/*`
   - `/config/*`
   - `/health`
   - `/hero.policy.json`
   - `/site.webmanifest`

5. **Create Policy:**
   - Name: "Public API Access"
   - Action: **"Bypass"**
   - Include: **"Everyone"**

6. **Save application**

#### Option B: Wildcard-basiert (Einfacher, aber weniger granular)

Falls du an das Limit für Pfade kommst, verwende Wildcards:

**Pfade:**
- `/api/*` (deckt `/api/v1/*` und `/api/thumbnails/*` ab)
- `/config/*`
- `/*.json` (deckt `/hero.policy.json` und `/site.webmanifest` ab)
- `/health`

### Schritt 4: Policy-Reihenfolge prüfen

**Wichtig:** Die Bypass-Policy muss **VOR** der Authentifizierungs-Policy stehen!

1. Gehe zu deiner Application
2. Prüfe unter **"Policies"** die Reihenfolge
3. Ziehe "API Bypass" / "Public API Access" **an die erste Stelle**

Cloudflare prüft Policies von oben nach unten - die erste passende Regel wird angewendet.

## Vollständige Liste der benötigten Pfade

| Pfad | Priorität | Was wird blockiert ohne? |
|------|-----------|--------------------------|
| `/api/v1/*` oder `/api/*` | **KRITISCH** | Keine Filme/Serien werden geladen |
| `/api/thumbnails/*` | **KRITISCH** | HTTP 520 Fehler bei allen Covern |
| `/config/*` | **KRITISCH** | Warnung "Config nicht geladen", Fallback auf Defaults |
| `/hero.policy.json` | WICHTIG | Hero-Banner zeigt nur Standard-Inhalte |
| `/health` | Optional | Health-Check funktioniert nicht |
| `/site.webmanifest` | Optional | CSP-Warnung im Browser |

## Testen der Konfiguration

### Test 1: Direkter Browser-Zugriff

Öffne diese URLs in deinem Browser (ersetze `katalog.dinspel.eu` mit deiner Domain):

1. **`https://katalog.dinspel.eu/api/v1/movies`**
   - **Erwartet:** JSON mit Filmliste
   - **Problem:** Redirect zu Cloudflare Login

2. **`https://katalog.dinspel.eu/config/frontend.json`**
   - **Erwartet:** `{"startView": "movies", "lang": "de-DE"}`
   - **Problem:** Zeigt HTML-Seite oder Redirect

3. **`https://katalog.dinspel.eu/health`**
   - **Erwartet:** `{"status":"healthy", ...}`
   - **Problem:** Redirect zu Login

### Test 2: Browser-Konsole

1. Öffne `https://katalog.dinspel.eu`
2. Drücke **F12** (Entwicklertools)
3. Schaue in die **Console**
4. Suche nach Fehlern wie:
   - `[main] Failed to load frontend config`
   - `Failed to load resource: the server responded with a status of 520`
   - CSP-Fehler mit `dinspel.cloudflareaccess.com`

**Nach dem Fix sollten diese Fehler verschwinden!**

### Test 3: Network-Tab

1. **F12** → **Network** Tab
2. Lade die Seite neu
3. Suche nach:
   - `frontend.json` → Status **200 OK** (nicht 302/307)
   - `movies` (API-Call) → Status **200 OK**
   - `poster.jpg` (Bilder) → Status **200 OK** (nicht 520)

## Content Security Policy (CSP) Anpassung

Falls du immer noch CSP-Fehler siehst, kannst du die CSP in `apps/frontend/public/index.html` anpassen:

**Suche nach (Zeile 32):**
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob:; ..." />
```

**Option 1: Cloudflare erlauben (nicht empfohlen)**
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: https://dinspel.cloudflareaccess.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tautulli.dinspel.eu https:; connect-src 'self' https://dinspel.cloudflareaccess.com; manifest-src 'self' https://dinspel.cloudflareaccess.com; font-src 'self'; base-uri 'self'; form-action 'self';" />
```

**Option 2: Bypass-Regeln korrekt konfigurieren (empfohlen)**

Die CSP sollte **nicht** angepasst werden müssen, wenn die Bypass-Regeln richtig konfiguriert sind!

## Troubleshooting

### Problem: API gibt immer noch 302/307 zurück

**Lösung:**
1. Warte 2-3 Minuten nach Änderungen (Cloudflare braucht Zeit)
2. Browser-Cache leeren (Strg+Shift+Del)
3. Prüfe Policy-Reihenfolge (Bypass muss oben stehen)
4. Prüfe ob Pfad-Match richtig ist (`/api/*` deckt `/api/v1/movies` ab)

### Problem: HTTP 520 Fehler bei Bildern

**Ursache:** `/api/thumbnails/*` ist nicht im Bypass

**Lösung:**
1. Füge `/api/thumbnails/*` zur Bypass-Liste hinzu
2. **ODER** verwende `/api/*` als Wildcard

### Problem: Config wird nicht geladen

**Ursache:** `/config/*` ist nicht im Bypass

**Lösung:**
1. Füge `/config/*` zur Bypass-Liste hinzu
2. Prüfe ob `https://katalog.dinspel.eu/config/frontend.json` JSON zurückgibt (nicht HTML)

### Problem: "Sie haben die maximal zulässige Anzahl von Hostnamen pro Anwendung hinzugefügt"

**Lösung:** Verwende Wildcards:
- Statt `/api/v1/*` und `/api/thumbnails/*` → Verwende `/api/*`
- Statt mehrere JSON-Dateien → Verwende `/*.json`

## Sicherheitsüberlegungen

### Ist es sicher, die API öffentlich zu machen?

**Ja, wenn:**
- ✅ Die API ist für öffentlichen Zugriff konzipiert (Read-Only Daten)
- ✅ Keine sensiblen Daten werden exponiert (nur Filmtitel/Cover)
- ✅ Admin-Endpunkte (`/admin/*`) bleiben geschützt
- ✅ Rate-Limiting ist im Backend implementiert

**Optional: API-Token-Authentifizierung**

Falls du die API doch schützen möchtest:
1. Setze `BACKEND_API_TOKEN` im Backend
2. Erstelle eine Cloudflare Service Token Policy statt Bypass
3. Passe das Frontend an, um den Token mitzusenden

Siehe: [Environment Variables](../configuration/environment-variables.md)

## Weiterführende Links

- [Cloudflare Zero Trust Dokumentation](https://developers.cloudflare.com/cloudflare-one/policies/access/)
- [Cloudflare Tunnel Setup](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [CSP Dokumentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
