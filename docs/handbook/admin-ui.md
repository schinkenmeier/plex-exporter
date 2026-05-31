# Admin-UI

## Zugriff

Die Admin-UI liegt unter `/admin`. Das Portal auf `/` verlinkt den Admin-Bereich als Maschinenraum, authentifiziert aber nicht selbst. Die Admin-UI ist nur nutzbar, wenn `ADMIN_USERNAME` und `ADMIN_PASSWORD` gemeinsam gesetzt sind; sonst antwortet das Backend mit `503`.

## Bereiche

- Dashboard: Laufzeit-, System- und Datenbankstatus.
- Config: maskierte Laufzeitkonfiguration und gespeicherte Integrationswerte.
- Logs: gepufferte Backend-Logs.
- Database: Read-only SQLite-Explorer mit freigegebenen Tabellen, Schemaansicht, begrenzten Abfragen und maskierten sensiblen Feldern.
- Tautulli: Verbindung, Library Sections, manueller Sync, Live-Status, Zeitpläne, Snapshots.
- Diagnostics: Tests für Datenbank und Integrationen.
- Watchlist Requests: eingegangene Watchlist-Anfragen, Status, Historie, Notizen und Antworten.
- Newsletter Campaigns: redaktionelle Newsletter-Drafts, Medienauswahl, Testversand, Versand und Empfängerstatus.

## Betriebsfunktionen

- Logs werden newest-first angezeigt und können nach Level, Zeitraum, Freitext (`q`) sowie per `limit`/`offset` paginiert abgefragt werden.
- Diagnostics können einzeln über die historischen Test-Endpunkte oder gesammelt über `POST /admin/api/diagnostics/run` für Datenbank, Tautulli, TMDB und Resend ausgeführt werden.
- Der Datenbank-Explorer nutzt `/admin/api/database/*`. Er zeigt nur explizit freigegebene Tabellen und liefert Schema, Filteroptionen und Zeilenabfragen getrennt aus.
- Nicht freigegebene Tabellen, interne Tabellen und Tabellen mit Secrets oder personenbezogenen Daten erscheinen nicht. Sensible Spalten werden nach Backend-Policy klassifiziert; es gibt keinen Reveal-Mechanismus für Rohwerte.
- Die alten Endpunkte `/admin/api/db/tables` und `/admin/api/db/query` sind abgelöst und antworten mit `410 Gone` plus Hinweis auf `/admin/api/database`.
- Das Admin-Profil unter `/admin/api/profile` liefert aktuell ein Single-Admin-Profil aus der Admin-Konfiguration und der aktiven Auth-Methode.
- Watchlist-Anfragen bleiben als Request-Paket modelliert. Statuswerte sind `new`, `in_progress`, `parked`, `done` und `rejected`; Statuswechsel können eine Kommentar-Message in der Historie speichern.
- Reply-Templates für Watchlist-Antworten sind derzeit feste Backend-Defaults. Editierbare Templates sind noch nicht Teil des produktiven Backends.
- Newsletter-Campaigns nutzen `draft`, `sending`, `sent` und `failed`. Nur Drafts können geändert oder gelöscht werden; der Legacy-Shortcut `POST /admin/api/newsletter/send` bleibt parallel erhalten.
- Campaigns können redaktionellen `subject`/`body`, optionalen Medienfilter und eine explizite Medienauswahl speichern. Testversand geht an frei angegebene Admin-Adressen und verändert den Draft nicht.
- Der finale Campaign-Versand schreibt Empfängerstatus (`pending`, `sent`, `failed`), Zähler (`recipientCount`, `sentCount`, `failedCount`) und die letzte Fehlermeldung. Subscriptions ohne Medienfilter erhalten Movie-/TV-Kampagnen mit.
- `newsletter_digests` bleibt als Legacy-Historie und für den bestehenden Shortcut lesbar; die genauere Versandhistorie liegt bei Campaigns in `newsletter_campaign_recipients`.

## Konfigurationslogik

- Env-Werte haben Vorrang vor DB-Werten.
- Tautulli kann per Env oder Admin-UI konfiguriert werden; gespeichert wird aktuell in `tautulli_config`.
- TMDB und Resend können ebenfalls aus Env oder gespeicherten Werten kommen.
- Statusanzeigen trennen aktive Quelle und gespeicherte Werte. Bei Env-Override bleibt der gespeicherte DB-Wert sichtbar und kann gelöscht werden.
- Tautulli-, TMDB- und Resend-Änderungen werden ohne Backend-Neustart angewendet.
- TMDB-Änderungen aktualisieren auch `/api/v1/tmdb/*`, Hero-Daten und Sync-Enrichment; Resend-Änderungen aktualisieren die Mail-Flows.

## Siehe auch

- Konfiguration: [../reference/configuration.md](../reference/configuration.md)
- Schnittstellen: [../reference/interfaces.md](../reference/interfaces.md)
- Troubleshooting: [../operations/troubleshooting.md](../operations/troubleshooting.md)
