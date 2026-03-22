# Benutzerhandbuch: Troubleshooting

## Der Katalog zeigt keine Inhalte
- Prüfe `http://<host>/health`.
- Prüfe, ob die Datenbank überhaupt befüllt ist.
- Wenn Tautulli genutzt wird, prüfe die Verbindung und den letzten Sync in der Admin-UI.

## Die Admin-Oberfläche ist nicht erreichbar
- Prüfe Benutzername und Passwort.
- Bei lokalem Source-Run: Frontend zuerst bauen, da das Backend die gebauten Admin-Assets ausliefert.

## Die Konfiguration scheint ignoriert zu werden
- Prüfe, ob die richtige Datei nach `apps/frontend/public/config/frontend.json` kopiert wurde.
- Prüfe, ob ENV-Werte gespeicherte DB-Werte überschreiben.

## Bilder oder API-Aufrufe funktionieren hinter Cloudflare nicht
- Wahrscheinlich blockiert eine Access-/Zero-Trust-Regel die nötigen Pfade.
- Siehe `../operations/cloudflare.md`.

## Wo die tieferen Ursachen dokumentiert sind
- Betriebsprobleme: `../operations/troubleshooting.md`
- Entwickler- und Build-Probleme: `../development/`
