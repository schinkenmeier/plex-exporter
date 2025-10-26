# Manual Verification

- **TMDB Toggle Guard:** Playwright automation enabled the TMDB toggle with a valid-looking token. The counter for `tmdb:chunk` events remained at `1` after a second enable cycle (`first_count: 1`, `second_count: 1`).
- **Hero Baseline Copy:** The hero headline rendered the English baseline copy `Discover Plex like it's premiere night` and the hero subtitle showed TMDb-driven metadata (tagline or overview excerpt) instead of the retired German strings.
- **Hero Tagline Rotation:** With TMDb enabled, the hero subtitle rotated to a different TMDb-provided tagline/overview excerpt within ~3.5s, reflecting the latest hero in the pool.
- **Empty Tagline/Overview Fallback:** When the selected TMDb item returned empty `tagline` and `overview` fields, the hero subtitle fell back to the baseline copy and appended the library name for context.
- **Fallback Gradients & Poster Blur:** For heroes lacking TMDb backdrop and poster imagery, the hero container rendered the gradient fallback and applied the blur effect to the Plex-provided poster before promoting the card.
- **Daily Hero Pool Reuse:** After a full reload within 24h the hero status badge showed `Aus Cache (≤24h)` and `hero:pipeline-update` reported `fromCache: true` while `/api/hero/*` responded with cached metadata.
- **Library Switch Reuse:** Switching between Movies and Shows via header tabs kept the network inspector quiet (`/api/hero/*` reused existing responses) and no additional TMDb requests were scheduled.
- **Manual Hero Refresh:** Triggering “Hero aktualisieren” in the settings overlay dispatched `hero:pipeline-update` with `regenerating: true` followed by a fresh pool timestamp and new hero selection.
- **Fallback Rendering:** With `localStorage.feature.heroPipeline=0` the hero container switched to `data-state="empty"`, showed the default copy, and no pipeline requests fired.
- **Offline & Rate-Limit Handling:** For network-offline or TMDb `429` simulations, the hero status badge surfaced `Offline` and the hero pipeline deferred requests until connectivity returned, while respecting the cached hero pool.
- **TMDb Attribution:** With TMDb enabled, the footer text `This product uses the TMDb API but is not endorsed or certified by TMDb.` remained visible alongside the TMDb logo.
- **TMDb Request Budget Tracking:** Open DevTools → Network, enable `Preserve log`, filter for `api.themoviedb.org`, and confirm the request counter does not exceed the documented daily budget after repeated hero refreshes. Record the observed count in the manual checklist to demonstrate compliance with the acceptance criteria.
