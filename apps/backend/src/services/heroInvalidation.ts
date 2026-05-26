import type { HeroPipelineService } from './heroPipeline.js';
import type { SyncStats } from './tautulliSyncService.js';

export const invalidateHeroPoolsForSyncStats = (
  heroPipeline: HeroPipelineService | null | undefined,
  stats: SyncStats,
  reason = 'tautulli-sync',
): number => {
  if (!heroPipeline) {
    return 0;
  }

  const changedKinds = new Set<'movies' | 'series'>();
  for (const result of stats.results ?? []) {
    const changed = result.created + result.updated + result.deleted;
    if (changed <= 0) continue;
    changedKinds.add(result.mediaType === 'tv' ? 'series' : 'movies');
  }

  if (!changedKinds.size && stats.totalCreated + stats.totalUpdated + stats.totalDeleted > 0) {
    return heroPipeline.invalidate(undefined, reason);
  }

  let invalidated = 0;
  for (const kind of changedKinds) {
    invalidated += heroPipeline.invalidate(kind, reason);
  }

  return invalidated;
};
