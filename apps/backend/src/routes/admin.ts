import express, { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { type AppConfig } from '../config/index.js';
import { HttpError } from '../middleware/errorHandler.js';
import type MediaRepository from '../repositories/mediaRepository.js';
import type ThumbnailRepository from '../repositories/thumbnailRepository.js';
import SettingsRepository from '../repositories/settingsRepository.js';
import type { TautulliConfigRepository } from '../repositories/tautulliConfigRepository.js';
import SeasonRepository from '../repositories/seasonRepository.js';
import CastRepository from '../repositories/castRepository.js';
import type { MailSender } from '../services/resendService.js';
import type { TautulliClient } from '../services/tautulliService.js';
import type { DrizzleDatabase } from '../db/index.js';
import type { TmdbManager } from '../services/tmdbManager.js';
import type { HeroPipelineService } from '../services/heroPipeline.js';
import type { TautulliConfigStatus } from '../services/tautulliConfigStatus.js';
import { createAdminDbExplorerRouter } from './admin/dbExplorer.js';
import { createAdminIntegrationsRouter } from './admin/integrations.js';
import { createAdminLegacyTautulliSettingsRouter } from './admin/legacyTautulliSettings.js';
import { createAdminLogsRouter } from './admin/logs.js';
import { createAdminOverviewRouter } from './admin/overview.js';
import { createAdminWatchlistSettingsRouter } from './admin/watchlistSettings.js';

export interface AdminRouterOptions {
  config: AppConfig;
  mediaRepository: MediaRepository;
  thumbnailRepository: ThumbnailRepository;
  resendService: MailSender | null;
  getResendService?: () => MailSender | null;
  tautulliService: TautulliClient | null;
  getTautulliService?: () => TautulliClient | null;
  seasonRepository?: SeasonRepository | null;
  castRepository?: CastRepository | null;
  drizzleDatabase?: DrizzleDatabase;
  settingsRepository: SettingsRepository;
  tautulliConfigRepository?: TautulliConfigRepository | null;
  tmdbManager: TmdbManager;
  heroPipeline: HeroPipelineService;
  refreshTautulliIntegration?: (input?: { baseUrl: string; apiKey: string }) => void;
  refreshResendIntegration?: () => MailSender | null;
  refreshTmdbIntegration?: () => unknown;
  getTautulliConfigStatus?: () => TautulliConfigStatus;
  adminUiDir?: string | null;
  serveUi?: boolean;
  adminAuthMethods?: Array<'basic' | 'bearer'>;
}

export type { TautulliConfigStatus, TautulliConfigSource } from '../services/tautulliConfigStatus.js';

export const createAdminRouter = (options: AdminRouterOptions): Router => {
  const router = Router();
  const {
    config,
    mediaRepository,
    thumbnailRepository,
    resendService,
    getResendService,
    tautulliService,
    getTautulliService,
    drizzleDatabase,
    seasonRepository,
    castRepository,
    settingsRepository,
    tautulliConfigRepository,
    tmdbManager,
    heroPipeline,
    refreshTautulliIntegration,
    refreshResendIntegration,
    refreshTmdbIntegration,
    getTautulliConfigStatus,
    adminUiDir = null,
    serveUi = true,
    adminAuthMethods = [],
  } = options;

  if (serveUi && !adminUiDir) {
    throw new Error('Admin UI directory is not configured. Please run the frontend build and pass adminUiDir.');
  }

  const adminIndexPath = adminUiDir ? path.join(adminUiDir, 'admin.html') : null;
  if (serveUi && adminIndexPath && !fs.existsSync(adminIndexPath)) {
    throw new Error(
      `Admin UI entry (${adminIndexPath}) nicht gefunden. Bitte das Frontend bauen (npm run build --workspace @plex-exporter/frontend).`,
    );
  }

  if (serveUi && adminUiDir) {
    router.use(express.static(adminUiDir, { index: false, redirect: false, fallthrough: true }));
  }

  router.get('/', (_req: Request, res: Response) => {
    if (!serveUi || !adminIndexPath) {
      throw new HttpError(404, 'Admin UI is not served by this backend.');
    }
    res.sendFile(adminIndexPath);
  });

  router.get('/api/auth/status', (_req: Request, res: Response) => {
    res.json({
      authenticated: true,
      method: res.locals.adminAuthMethod ?? null,
      methods: adminAuthMethods,
    });
  });

  // Keep these mounts path-compatible with the frontend AdminApiClient. Several
  // routers intentionally share the historical /admin/api prefix, so add new
  // endpoints to the most specific domain router first and avoid duplicate paths.
  router.use(
    '/api',
    createAdminOverviewRouter({
      config,
      mediaRepository,
      thumbnailRepository,
      resendService,
      getResendService,
      drizzleDatabase,
      seasonRepository,
      castRepository,
      settingsRepository,
      tautulliConfigRepository,
      tmdbManager,
      getTautulliConfigStatus,
    }),
  );

  router.use('/api/db', createAdminDbExplorerRouter({ drizzleDatabase }));
  router.use(
    '/api',
    createAdminIntegrationsRouter({
      config,
      mediaRepository,
      resendService,
      getResendService,
      tautulliService,
      getTautulliService,
      settingsRepository,
      tmdbManager,
      heroPipeline,
      refreshResendIntegration,
      refreshTmdbIntegration,
    }),
  );
  router.use('/api/logs', createAdminLogsRouter());
  router.use(
    '/api/tautulli/settings',
    createAdminLegacyTautulliSettingsRouter({
      config,
      settingsRepository,
      tautulliConfigRepository,
      refreshTautulliIntegration,
      getTautulliConfigStatus,
    }),
  );
  router.use('/api/watchlist', createAdminWatchlistSettingsRouter({ settingsRepository }));

  return router;
};

export default createAdminRouter;
