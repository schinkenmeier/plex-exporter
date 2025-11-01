# Manual Verification

- **Daily Hero Pool Reuse:** After a full reload within 24h the hero status badge showed `Aus Cache (≤24h)` and `hero:pipeline-update` reported `fromCache: true` while `/api/hero/*` responded with cached metadata.
- **Manual Hero Refresh:** Triggering “Hero aktualisieren” in the settings overlay dispatched `hero:pipeline-update` with `regenerating: true` followed by a fresh pool timestamp and new hero selection.
- **Fallback Rendering:** With `localStorage.feature.heroPipeline=0` the hero container switched to `data-state="empty"`, showed the default copy, and no pipeline requests fired.
