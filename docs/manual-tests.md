# Manual Verification

- **TMDB Toggle Guard:** Playwright automation enabled the TMDB toggle with a valid-looking token. The counter for `tmdb:chunk` events remained at `1` after a second enable cycle (`first_count: 1`, `second_count: 1`).
- **Hero Tagline Rotation:** The hero subtitle changed from `Offline stöbern & Wunschlisten teilen` to `Filter. Finden. Freuen.` within ~3.5s.
