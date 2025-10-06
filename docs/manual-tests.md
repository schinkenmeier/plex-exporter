# Manual Verification

- **TMDB Toggle Guard:** Playwright automation enabled the TMDB toggle with a valid-looking token. The counter for `tmdb:chunk` events remained at `1` after a second enable cycle (`first_count: 1`, `second_count: 1`).
- **Hero Tagline Rotation:** The hero subtitle changed from `Offline stöbern & Wunschlisten teilen` to `Filter. Finden. Freuen.` within ~3.5s.
- **Daily Hero Cache Reuse:** After a full reload within 24h the hero status badge showed `Aus Cache (≤24h)` and `hero:pipeline-update` reported `fromCache: true` without issuing new pool requests.
- **Library Switch Cache Hit:** Switching between Movies and Shows via header tabs kept the network inspector quiet (`hero.policy.json` and TMDb endpoints untouched) because `ensureHeroPool()` rehydrated the existing session cache.
- **Manual Hero Refresh:** Triggering “Hero aktualisieren” in the settings overlay dispatched `hero:pipeline-update` with `regenerating: true` followed by a fresh pool timestamp and new hero selection.
- **Fallback Rendering:** With `localStorage.feature.heroPipeline=0` the hero container switched to `data-state="empty"`, showed the default copy, and no pipeline requests fired.
- **TMDb Attribution:** With TMDb enabled, the footer text `This product uses the TMDb API but is not endorsed or certified by TMDb.` remained visible alongside the TMDb logo.
