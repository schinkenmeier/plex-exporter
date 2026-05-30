# Admin Backend Readiness Overview

Stand: 2026-05-30

## Ziel

Dieses Dokument beschreibt, welche Backend-Funktionen für das redesigned Admin UI noch fehlen oder geschaerft werden sollten. Das Mock-up unter `new_admin-ui/` dient dabei als Funktions- und UX-Referenz, nicht als technische Vorlage. Die bestehenden API-Werte, Datenmodelle und Namenskonventionen bleiben massgeblich.

## Leitlinien

- Backend zuerst: UI-Views sollen spaeter gegen echte, stabile Admin-APIs gebaut werden koennen.
- Bestehende Domain-Modelle behalten: z. B. Watchlist-Request-Status `new`, `in_progress`, `parked`, `done`, `rejected`.
- Admin-API bleibt unter `/admin/api/*`, Public-API bleibt getrennt.
- Kein UI-spezifisches Mock-Datenmodell ins Backend uebernehmen.
- Bei jeder neuen Admin-Funktion: API-Typen, Tests und Fehlerfaelle mitliefern.

## Aktueller Abdeckungsgrad

| Bereich | Backend-Status | Bewertung |
| --- | --- | --- |
| Dashboard | `/admin/api/status`, `/stats`, `/config` vorhanden | Gut abgedeckt |
| Konfiguration | TMDb, Resend, Watchlist-Admin-Mail, Tautulli-Konfig vorhanden | Gut abgedeckt |
| Anfragen | Request-Lifecycle, Events, Status, Notiz, Reply-Mail, Summary und Reply-Templates vorhanden | Gut für Paket-Anfragen abgedeckt |
| Tautulli Sync | Config, Libraries, Sections, Manual Sync, SSE Live-State, Schedules, Snapshot-Limit vorhanden; Mutationsresponses und AdminApiClient sind ergaenzt | Gut abgedeckt |
| Logs | Liste, Level/Since/Limit/Offset/Q, Clear, Pagination und newest-first vorhanden | Gut für Polling abgedeckt |
| Diagnostics | DB, Tautulli, TMDb, Resend Einzeltests plus Batch-Endpoint vorhanden | Gut abgedeckt |
| Admin Profile | Minimalprofil aus Admin-Config/Auth-Context vorhanden | Gut für Single-Admin abgedeckt |
| Welcome-Mail | Send, Check, History, Delete, Stats vorhanden | Gut abgedeckt |
| Newsletter | Subscribe/Unsubscribe, Send Digest, Stats, Recent Media, Digest History vorhanden | Fachlich noch unfertig |
| Datenbank-Explorer | Tables, Query, Filter, Sort, Pagination vorhanden | Stark abgedeckt |

## Phase 1: API-Kontrakt und Admin-Client vervollstaendigen

### 1.1 Tautulli Admin Client vollstaendig spiegeln

Status: Erledigt in Sprint A.

Backend und typisierter Admin-Client bilden diese Endpunkte ab:

- `PUT /admin/api/tautulli/library-sections/:id/enabled`
- `PUT /admin/api/tautulli/sync/schedules/:id/enabled`
- `DELETE /admin/api/tautulli/sync/schedules/:id`

Umsetzung:

- Methoden und Typen in `apps/frontend/src/admin/core/api.ts` ergaenzen.
- Falls Rückgabeformen uneinheitlich sind, Backend responses angleichen:
  - `success: true`
  - `message`
  - `section` oder `schedule`
- Tests für Schedule enable/delete und Library Section enable ergaenzen.

### 1.2 Einheitliche Admin-API-Response-Formen

Einige Routen liefern `{ message, schedule }`, andere `{ success, data }`. Für ein neues UI ist das wartbar, aber unschoen.

Empfehlung:

- Keine harte Breaking-Change-Welle.
- Neue oder geaenderte Admin-Endpunkte liefern konsequent:
  - Erfolg: `{ success: true, data?: T, message?: string }`
  - Fehler: bestehender `HttpError`/`errorHandler`
- Bestehende Endpunkte nur anfassen, wenn ohnehin daran gearbeitet wird.

## Phase 2: Watchlist Requests produktionsreif machen

Basis ist vorhanden:

- `watchlist_requests`
- `watchlist_request_events`
- Public Submit speichert zuerst.
- Admin list/detail/status/note/reply.

Status: Sprint-A-Komfortfunktionen erledigt. Item-Level-Status bleibt bewusst offen.

### 2.1 Request Summary Endpoint

Vorhandener Endpoint:

- `GET /admin/api/watchlist/requests/summary`

Rückgabe:

```json
{
  "success": true,
  "counts": {
    "total": 12,
    "new": 3,
    "in_progress": 2,
    "parked": 1,
    "done": 5,
    "rejected": 1
  },
  "requesterCount": 4,
  "oldestOpenRequestAt": "2026-05-30T18:00:00.000Z"
}
```

Nutzen:

- Badge in der Navigation.
- Metriken im Anfrage-Tab ohne komplette Liste laden zu muessen.

### 2.2 Statuswechsel mit optionalem Kommentar

Statuswechsel kann eine optionale Message speichern:

- `PATCH /admin/api/watchlist/requests/:id/status`
- Body erweitert um optional `message`.

Beispiel:

```json
{
  "status": "parked",
  "message": "Warte auf bessere Quelle"
}
```

### 2.3 Reply Templates optional vorbereiten

API-seitig vorbereitet:

- `GET /admin/api/watchlist/reply-templates`
- spaeter `PUT /admin/api/watchlist/reply-templates`

Erstmal koennen Default-Templates im Backend konstant sein:

- `accept`: "Kann ich machen."
- `park`: "Ich parke das erstmal."
- `reject`: "Kann ich leider nicht machen."
- `done`: "Ist erledigt."

### 2.4 Mehrere Items pro Anfrage bewusst modellieren

Backend speichert bereits `items[]`. Für spaetere UI-Entscheidungen fehlen optional:

- Item-Level Status nur, wenn wirklich gebraucht.
- Sonst Request bleibt Paket und UI klappt Items auf.

Empfehlung:

- Kein Item-Level-Status jetzt einfuehren.
- Erst UI-Design klaeren.
- Falls noetig spaeter eigene Tabelle `watchlist_request_items` statt JSON migrieren.

## Phase 3: Newsletter von Platzhalter zu Produktfunktion

Das ist die groesste fachliche Luecke.

Aktuell:

- Public subscribe/unsubscribe.
- Admin subscriptions.
- Admin send newsletter auf Basis recent media.
- Digest-Tabelle speichert nur `mediaType`, `mediaItemIds`, `recipientCount`.

Probleme:

- Kein Betreff/Text aus Admin-UI.
- Keine Drafts.
- Kein Testversand.
- Kein Versandprotokoll pro Empfaenger.
- Kein Unsubscribe-Token/Link.
- Digest `mediaType` erzwingt aktuell `movie`, wenn "all" gesendet wird.
- HTML wird im Service per String gebaut und ist noch englisch/roh.

### 3.1 Newsletter Campaigns einfuehren

Neue Tabelle `newsletter_campaigns`:

- `id`
- `subject`
- `body`
- `media_type` nullable
- `status`: `draft`, `sending`, `sent`, `failed`
- `media_item_ids` JSON
- `recipient_count`
- `sent_count`
- `failed_count`
- `created_at`
- `updated_at`
- `sent_at`

Neue Tabelle `newsletter_campaign_recipients`:

- `id`
- `campaign_id`
- `email`
- `status`: `pending`, `sent`, `failed`
- `email_id`
- `error_message`
- `sent_at`

### 3.2 Newsletter Admin API

Neue/erweiterte Endpunkte:

- `GET /admin/api/newsletter/campaigns`
- `GET /admin/api/newsletter/campaigns/:id`
- `POST /admin/api/newsletter/campaigns`
- `PATCH /admin/api/newsletter/campaigns/:id`
- `POST /admin/api/newsletter/campaigns/:id/test`
- `POST /admin/api/newsletter/campaigns/:id/send`
- `DELETE /admin/api/newsletter/campaigns/:id` nur für Drafts

Bestehende Endpunkte koennen parallel bleiben.

### 3.3 Subscription Management

Ergaenzen:

- `GET /admin/api/newsletter/subscriptions?active=true|false&mediaType=movie|tv`
- `PATCH /admin/api/newsletter/subscriptions/:id`
- `DELETE /admin/api/newsletter/subscriptions/:id`

Public:

- Unsubscribe sollte langfristig tokenbasiert sein, nicht nur E-Mail im Body.

## Phase 4: Logs und Live-Monitoring schaerfen

Status: Sprint B erledigt.

Aktuell:

- `GET /admin/api/logs`
- `DELETE /admin/api/logs`
- Query: `level`, `since`, `limit`, `offset`, `q`
- Antwort: `logs`, `stats`, `pagination` mit `sort: "newest-first"`

### 4.1 Log Query verbessern

Erledigt in Sprint B.

### 4.2 Optional Log SSE

Mock-up hat Live-Modus. Kann erstmal per Polling geloest werden. Falls echtes Live gewuenscht:

- `GET /admin/api/logs/stream`
- SSE Events bei neuen LogBuffer-Eintraegen.

Voraussetzung:

- `logBuffer` muss subscribe/faehig werden.

## Phase 5: Diagnostics vereinheitlichen

Status: Batch-Endpoint aus Sprint B ist vorhanden; Persistenz letzter Ergebnisse bleibt optional.

Empfehlung:

- `GET /admin/api/diagnostics` für letzte bekannte Ergebnisse optional.
- `POST /admin/api/diagnostics/run` mit Body `{ checks: ["database", "tautulli", "tmdb", "resend"] }` ist vorhanden.

Nutzen:

- UI kann "Alle testen" gegen einen Endpoint laufen lassen.
- Ergebnisse haben einheitliche Form:

```json
{
  "key": "resend",
  "success": true,
  "message": "Connection successful",
  "durationMs": 167,
  "checkedAt": "2026-05-30T20:00:00.000Z"
}
```

Nicht kritisch für Start.

## Phase 6: Admin Meta/Profile

Status: Minimalprofil aus Sprint B ist vorhanden.

Mock-up zeigt Owner/Avatar oben rechts.

Vorhandener Endpoint:

- `GET /admin/api/profile`

Rückgabe:

```json
{
  "name": "Admin",
  "role": "Administrator",
  "authMethod": "basic",
  "initials": "AD"
}
```

Quelle:

- Erstmal aus Admin-Config/Auth-Status ableiten.
- Kein echtes User-System einfuehren, solange nicht benoetigt.

## Phase 7: Dokumentation und Teststrategie

Jede Phase sollte enthalten:

- Migration, falls Datenmodell.
- Repository/Service, falls Businesslogik.
- Admin-Route.
- AdminApiClient-Typen, falls Frontend relevant.
- Supertest/Vitest für Routes.
- Mindestens ein Fehlerfall pro Endpoint.

Empfohlene Testgruppen:

- `tests/routes/admin.integration.test.ts`: API-Kontrakt und Admin-Flows.
- Eigene Tests für Newsletter-Campaigns.
- Repository-Tests für Watchlist/Newsletter, wenn Logik komplexer wird.

## Priorisierte Umsetzung

### P0: Schon erledigt

- Watchlist Request Lifecycle Basis.
- Dashboard/Config/Logs/Tautulli/Diagnostics API-Basis.
- Tautulli Admin Client/Response-Luecken.
- Watchlist Request Summary + Status-Kommentar + Reply-Templates.
- Log Query mit `q`, `offset`, Pagination und newest-first.
- Diagnostics Batch Endpoint.
- Admin Profile Endpoint.

### P1: Nächste sinnvolle Backend-Arbeiten

1. Newsletter Campaign Datenmodell + Draft/Test/Send API.

### P2: Komfort und Realtime

2. Optionaler Log Stream, falls Polling nicht reicht.

### P3: Spaetere fachliche Verfeinerung

3. Watchlist Item-Level-Status nur falls UI-Design das wirklich braucht.
4. Newsletter tokenbasiertes Unsubscribe.
5. Mail-Template-System für Watchlist/Newsletter/Welcome.

## Offene Produktentscheidungen

- Sollen Watchlist-Anfragen immer als Paket behandelt werden oder pro Titel steuerbar sein?
- Soll Newsletter manuell redaktionell geschrieben werden, automatisch aus Recent Media kommen oder beides?
- Soll Admin-UI echtes Live-Log-Streaming brauchen oder reicht Polling?
- Soll es langfristig mehrere Admin-User geben oder bleibt es ein Single-Admin-Tool?
- Sollen Mail-Templates im Admin editierbar sein oder erstmal feste Defaults bleiben?

## Empfohlener nächster Schritt

Nächster größerer Block ist Sprint C:

1. Newsletter Campaign Datenmodell + Migration.
2. Draft/Test/Send API mit Empfaenger-Historie.
3. Bestehenden Digest-/Send-Flow als Legacy-Shortcut kompatibel halten.

## Konkretisierte Ausführungsplanung

Diese Reihenfolge ist für die Umsetzung vorgesehen. Sie trennt kleine API-Kontrakt-Arbeiten von größeren Migrations-/Domain-Änderungen.

### Sprint A: Kleine Admin-API-Luecken ohne Migration

Ziel: Schnell nutzbare Backend-Ergaenzungen für das neue Admin UI, ohne Datenmodell-Risiko.

Write-Set:

- `apps/backend/src/routes/tautulliSync.ts`
- `apps/backend/src/routes/admin/watchlistRequests.ts`
- `apps/backend/src/repositories/watchlistRequestRepository.ts`
- `apps/frontend/src/admin/core/api.ts`
- relevante Backend-/Frontend-Tests

Umfang:

1. Tautulli Responses kompatibel erweitern:
   - `PUT /admin/api/tautulli/library-sections/:id/enabled`
   - `PUT /admin/api/tautulli/sync/schedules/:id/enabled`
   - `DELETE /admin/api/tautulli/sync/schedules/:id`
   - neue Responses enthalten `success: true`, `message` und `section` bzw. `schedule`.
2. AdminApiClient ergaenzen:
   - `setLibrarySectionEnabled`
   - `setSyncScheduleEnabled`
   - `deleteSyncSchedule`
3. Watchlist Requests erweitern:
   - `GET /admin/api/watchlist/requests/summary`
   - optionaler `message` bei `PATCH /admin/api/watchlist/requests/:id/status`
   - `GET /admin/api/watchlist/reply-templates` mit konstanten Defaults.
4. Tests:
   - Tautulli enable/delete Happy Path und Fehlerfaelle.
   - Watchlist Summary mit allen Status-Keys.
   - Statuswechsel erzeugt Event mit Message.
   - Reply Templates liefern stabile Keys.

Verifikation:

- `npm run type-check --workspace @plex-exporter/backend`
- `npm run type-check --workspace @plex-exporter/frontend`
- gezielte Backend-Tests für Admin/Tautulli
- betroffene Frontend-AdminApiClient-Tests

Status: Abgeschlossen am 2026-05-30.

Kurznotiz:

- Tautulli-Mutationsendpunkte liefern nun kompatibel `success: true` plus `section` bzw. `schedule`; der AdminApiClient spiegelt die fehlenden Enable-/Delete-Methoden.
- Watchlist Requests haben einen Summary-Endpunkt, feste Reply-Templates und optionale Status-Kommentare, die als Event-Message in der Historie landen.
- Abgedeckt durch neue/erweiterte Admin- und Tautulli-Integrationstests sowie AdminApiClient-Typen.
- Verifiziert mit Backend-/Frontend-Typecheck, gezielten Admin/Tautulli-Tests, Frontend-Testlauf und kompletter Backend-Test-Suite.

### Sprint B: Logs, Diagnostics und Admin Profile

Ziel: Das redesigned Admin UI bekommt stabilere Query- und Meta-Endpunkte, ohne direkt Live-SSE für Logs einzufuehren.

Write-Set:

- `apps/backend/src/routes/admin/logs.ts`
- optional `apps/backend/src/routes/admin/diagnostics.ts`
- `apps/backend/src/routes/admin.ts`
- `apps/frontend/src/admin/core/api.ts`
- relevante Tests

Umfang:

1. Logs Query verbessern:
   - `q` für Message und Context.
   - `offset` für Pagination.
   - klare Sortierung dokumentieren, bevorzugt newest-first.
2. Diagnostics Batch:
   - `POST /admin/api/diagnostics/run`
   - Body: `{ checks: ["database", "tautulli", "tmdb", "resend"] }`
   - Ergebnis pro Check mit `success`, `message`, `durationMs`, `checkedAt`.
3. Admin Profile:
   - `GET /admin/api/profile`
   - Minimaldaten: Name, Rolle, Auth-Methode, Initialen.

Explizit verschoben:

- `GET /admin/api/logs/stream` erst spaeter, falls echtes Live-Streaming benoetigt wird. Für den Start reicht Polling.

Status: Abgeschlossen am 2026-05-30.

Kurznotiz:

- Logs unter `GET /admin/api/logs` unterstuetzen jetzt `q`, `offset`, Pagination-Metadaten und liefern die Treffer explizit `newest-first`.
- `POST /admin/api/diagnostics/run` fuehrt ausgewaehlte Checks für `database`, `tautulli`, `tmdb` und `resend` als Batch aus und liefert pro Check Status, Message, Laufzeit und Zeitstempel.
- `GET /admin/api/profile` liefert minimale Admin-Metadaten für das redesigned UI; der AdminApiClient spiegelt Profile, Diagnostics und die erweiterten Log-Parameter.
- Abgedeckt durch Admin-Integrationstests und AdminApiClient-Test; verifiziert mit Backend-/Frontend-Typecheck, Frontend-Testlauf und kompletter Backend-Test-Suite.

### Sprint C: Newsletter Campaigns als groesserer Domain-Block

Ziel: Newsletter vom Platzhalter-/Digest-Flow zu einer echten Admin-Funktion ausbauen.

Write-Set:

- neue Migration `014_newsletter_campaigns.ts`
- `apps/backend/src/db/migrations/index.ts`
- `apps/backend/src/db/schema.ts`
- neues Repository, z. B. `newsletterCampaignRepository.ts`
- `apps/backend/src/services/newsletterService.ts` oder eigener Campaign-Service
- `apps/backend/src/routes/newsletter.ts`
- Backend-Tests inklusive Security-Grenzen

Datenmodell:

- `newsletter_campaigns`
  - `id`
  - `subject`
  - `body`
  - `media_type` nullable
  - `media_item_ids` JSON
  - `status`: `draft`, `sending`, `sent`, `failed`
  - `recipient_count`
  - `sent_count`
  - `failed_count`
  - `last_error_message`
  - `created_at`, `updated_at`, `sent_at`
- `newsletter_campaign_recipients`
  - `id`
  - `campaign_id`
  - `subscription_id` nullable
  - `email`
  - `status`: `pending`, `sent`, `failed`
  - `email_id`
  - `error_message`
  - `created_at`, `updated_at`, `sent_at`

Admin API:

- `GET /admin/api/newsletter/campaigns`
- `GET /admin/api/newsletter/campaigns/:id`
- `POST /admin/api/newsletter/campaigns`
- `PATCH /admin/api/newsletter/campaigns/:id` nur für Drafts
- `DELETE /admin/api/newsletter/campaigns/:id` nur für Drafts
- `POST /admin/api/newsletter/campaigns/:id/test`
- `POST /admin/api/newsletter/campaigns/:id/send`

Rückwärtskompatibilität:

- Bestehende Subscribe/Unsubscribe-Endpunkte bleiben.
- Bestehendes `POST /admin/api/newsletter/send` bleibt zunächst als Legacy-Shortcut.
- `newsletter_digests` bleibt lesbar, wird aber perspektivisch von Campaign-History abgeloest.
- Empfaengerlogik korrigieren: Abo mit `media_type = NULL` bedeutet "alle" und muss bei Movie/TV-Kampagnen mitlaufen.

Tests:

- Campaign CRUD inklusive Draft-only Regeln.
- Testversand.
- Send mit teilweisen Mailfehlern und korrekten Recipient-Statuses.
- Security-Test: Campaign-Routen nur unter `/admin/api/newsletter/*`, nicht public.
- Legacy `POST /admin/api/newsletter/send` funktioniert weiter.

### Sprint D: Spaetere Vertiefungen

Nur angehen, wenn Produktentscheidung gefallen ist:

- Watchlist Item-Level-Status statt Paket-Status.
- Tokenbasiertes Newsletter-Unsubscribe.
- Editierbare Mail-Templates für Watchlist, Newsletter und Welcome.
- Echter Log-SSE-Stream.
- Mehrbenutzerfaehiges Admin-Profil/User-Modell.
