import { Router } from 'express';
import type { AppConfig } from '../../config/index.js';
import type { DrizzleDatabase } from '../../db/index.js';
import type MediaRepository from '../../repositories/mediaRepository.js';
import type ThumbnailRepository from '../../repositories/thumbnailRepository.js';
import SettingsRepository from '../../repositories/settingsRepository.js';
import type { TautulliConfigRepository } from '../../repositories/tautulliConfigRepository.js';
import SeasonRepository from '../../repositories/seasonRepository.js';
import CastRepository from '../../repositories/castRepository.js';
import type { MailSender } from '../../services/resendService.js';
import type { TmdbManager } from '../../services/tmdbManager.js';
import type { TautulliConfigStatus } from '../../services/tautulliConfigStatus.js';
import { createAdminRuntimeConfigRouter } from './runtimeConfig.js';
import { createAdminStatsRouter } from './stats.js';
import { createAdminSystemStatusRouter } from './systemStatus.js';

export interface AdminOverviewRouterOptions {
  config: AppConfig;
  mediaRepository: MediaRepository;
  thumbnailRepository: ThumbnailRepository;
  resendService: MailSender | null;
  getResendService?: () => MailSender | null;
  drizzleDatabase?: DrizzleDatabase;
  seasonRepository?: SeasonRepository | null;
  castRepository?: CastRepository | null;
  settingsRepository: SettingsRepository;
  tautulliConfigRepository?: TautulliConfigRepository | null;
  tmdbManager: TmdbManager;
  getTautulliConfigStatus?: () => TautulliConfigStatus;
}

export const createAdminOverviewRouter = (options: AdminOverviewRouterOptions): Router => {
  const router = Router();
  const {
    config,
    mediaRepository,
    thumbnailRepository,
    resendService,
    getResendService,
    drizzleDatabase,
    seasonRepository: suppliedSeasonRepository,
    castRepository: suppliedCastRepository,
    settingsRepository,
    tautulliConfigRepository,
    tmdbManager,
    getTautulliConfigStatus,
  } = options;

  router.use(createAdminSystemStatusRouter());
  router.use(
    createAdminRuntimeConfigRouter({
      config,
      resendService,
      getResendService,
      settingsRepository,
      tautulliConfigRepository,
      tmdbManager,
      getTautulliConfigStatus,
    }),
  );
  router.use(
    createAdminStatsRouter({
      config,
      mediaRepository,
      thumbnailRepository,
      drizzleDatabase,
      seasonRepository: suppliedSeasonRepository,
      castRepository: suppliedCastRepository,
    }),
  );

  return router;
};
