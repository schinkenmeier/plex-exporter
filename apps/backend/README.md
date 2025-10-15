# Plex Exporter Backend

Dieses Paket stellt das Fundament für eine künftige API bereit, die Plex-Exports über HTTP verfügbar macht. Ziel ist es, vorbereitete JSON-Dumps aus `data/exports/` strukturiert auszuliefern, sie optional aufzubereiten und zukünftige Verwaltungsaufgaben (z. B. Re-Exports, Validierungen, Authentifizierung) zu übernehmen.

## Aktueller Stand
- Ein Express-Server (`src/server.ts`) mit vorbereiteten Routen und gemeinsamer Middleware-Konfiguration.
- Ein Health-Endpunkt unter `/health`, implementiert in `src/routes/health.ts`, der eine einfache Betriebsprüfung erlaubt.
- Platzhalter für automatisierte Tests (`tests/`).

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

¹ `SMTP_HOST`, `SMTP_PORT` und `SMTP_FROM` müssen gemeinsam gesetzt werden, sobald SMTP genutzt werden soll.

² `TAUTULLI_URL` und `TAUTULLI_API_KEY` müssen gemeinsam gesetzt werden, sobald eine Integration aktiv ist.

## Nächste Schritte
- Anbindung an reale Exportdaten aus `data/exports/`.
- Ergänzung weiterer Routen (z. B. `/movies`, `/shows`).
- Konfiguration von Logging, Fehlerbehandlung und Authentifizierung.
- Erweiterung der Test-Suite (Unit-, Integrations- und Contract-Tests).
