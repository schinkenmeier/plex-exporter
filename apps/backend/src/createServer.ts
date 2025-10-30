import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { type AppConfig, loadPersistedConfig } from './config/index.js';
import { createLibrariesRouter } from './routes/libraries.js';
import { createHealthRouter } from './routes/health.js';
import { createExportsRouter } from './routes/exports.js';
import { createV1Router } from './routes/v1.js';
import watchlistRouter from './routes/watchlist.js';
import welcomeEmailRouter from './routes/welcomeEmail.js';
import newsletterRouter from './routes/newsletter.js';
import {
  createTautulliService,
  type TautulliClient,
  TautulliService as TautulliServiceClass,
} from './services/tautulliService.js';
import { createResendService, type MailSender } from './services/resendService.js';
import {
  initializeDrizzleDatabase,
  type SqliteDatabase,
  type DrizzleDatabase,
} from './db/index.js';
import { setGlobalDb } from './db/globalDb.js';
import { watchlistEmailService } from './services/watchlistEmailService.js';
import { welcomeEmailService } from './services/welcomeEmailService.js';
import { newsletterService } from './services/newsletterService.js';
import MediaRepository from './repositories/mediaRepository.js';
import ThumbnailRepository from './repositories/thumbnailRepository.js';
import TautulliSnapshotRepository from './repositories/tautulliSnapshotRepository.js';
import SeasonRepository from './repositories/seasonRepository.js';
import CastRepository from './repositories/castRepository.js';
import { LibrarySectionRepository } from './repositories/librarySectionRepository.js';
import { SyncScheduleRepository } from './repositories/syncScheduleRepository.js';
import { TautulliConfigRepository } from './repositories/tautulliConfigRepository.js';
import { createMediaRouter } from './routes/media.js';
import { errorHandler, requestLogger } from './middleware/errorHandler.js';
import { createAuthMiddleware } from './middleware/auth.js';
import SettingsRepository from './repositories/settingsRepository.js';
import { createTmdbManager, type TmdbManager } from './services/tmdbManager.js';
import createHeroPipelineService from './services/heroPipeline.js';
import { createHeroRouter } from './routes/hero.js';
import { setupSwagger } from './config/swaggerSetup.js';
import { createAdminRouter } from './routes/admin.js';
import { createBasicAuthMiddleware } from './middleware/basicAuth.js';
import { createThumbnailRouter } from './routes/thumbnails.js';
import { createTautulliSyncRouter } from './routes/tautulliSync.js';
import { TautulliSyncService } from './services/tautulliSyncService.js';
import { SchedulerService } from './services/schedulerService.js';
import logger from './services/logger.js';

export interface ServerDependencies {
  resendService?: MailSender | null;
  tautulliService?: TautulliClient | null;
  database?: SqliteDatabase | null;
  drizzleDatabase?: DrizzleDatabase | null;
  mediaRepository?: MediaRepository | null;
  thumbnailRepository?: ThumbnailRepository | null;
  tautulliSnapshotRepository?: TautulliSnapshotRepository | null;
  seasonRepository?: SeasonRepository | null;
  castRepository?: CastRepository | null;
  settingsRepository?: SettingsRepository | null;
  tmdbManager?: TmdbManager | null;
}

export const createServer = (appConfig: AppConfig, deps: ServerDependencies = {}) => {
  const app = express();

  const databaseResult =
    'database' in deps || 'drizzleDatabase' in deps
      ? {
          sqlite: deps.database ?? null,
          db: deps.drizzleDatabase ?? null,
        }
      : initializeDrizzleDatabase({ filePath: appConfig.database.sqlitePath });

  const database = databaseResult.sqlite;
  const drizzleDb = databaseResult.db ?? null;

  if (!database || !drizzleDb) {
    throw new Error('Database connection could not be initialised.');
  }

  // Set global database for email services
  setGlobalDb(drizzleDb);

  const settingsRepository =
    'settingsRepository' in deps
      ? deps.settingsRepository ?? null
      : new SettingsRepository(drizzleDb);

  if (!settingsRepository) {
    throw new Error('Settings repository could not be initialised.');
  }

  // Load persisted configuration from database (supplements environment variables)
  const persistedConfig = loadPersistedConfig((key: string) => settingsRepository.get(key));

  // Initialize Resend service with environment or persisted config
  let resendService =
    'resendService' in deps
      ? deps.resendService ?? null
      : null;

  if (!resendService) {
    const resendConfig = appConfig.resend ?? persistedConfig.resend;
    if (resendConfig) {
      resendService = createResendService(resendConfig);
      if (!appConfig.resend && persistedConfig.resend) {
        logger.info('Resend service initialized from database settings', { fromEmail: resendConfig.fromEmail });
      }
    }
  }

  // Initialize email services with mail sender if available
  if (resendService) {
    watchlistEmailService.setMailSender(resendService);
    welcomeEmailService.setMailSender(resendService);
    newsletterService.setMailSender(resendService);
  }

  // Initialize Tautulli service with environment or persisted config
  let tautulliService =
    'tautulliService' in deps
      ? deps.tautulliService ?? null
      : null;

  if (!tautulliService) {
    const tautulliConfig = appConfig.tautulli ?? persistedConfig.tautulli;
    if (tautulliConfig) {
      tautulliService = createTautulliService({
        baseUrl: tautulliConfig.url,
        apiKey: tautulliConfig.apiKey,
      });
      if (!appConfig.tautulli && persistedConfig.tautulli) {
        logger.info('Tautulli service initialized from database settings', { url: tautulliConfig.url });
      }
    }
  }

  const storedTmdbSetting = settingsRepository.get('tmdb.accessToken');
  const defaultTmdbOptions = {
    envToken: appConfig.tmdb?.accessToken ?? null,
    dbToken: storedTmdbSetting?.value ?? null,
    updatedAt: storedTmdbSetting?.updatedAt ?? null,
  };

  const tmdbManager: TmdbManager =
    'tmdbManager' in deps && deps.tmdbManager
      ? deps.tmdbManager
      : createTmdbManager(defaultTmdbOptions);

  if ('tmdbManager' in deps && deps.tmdbManager) {
    const options = storedTmdbSetting?.updatedAt
      ? { updatedAt: storedTmdbSetting.updatedAt }
      : undefined;
    tmdbManager.setDatabaseToken(storedTmdbSetting?.value ?? null, options);
  }

  const tmdbService = tmdbManager.getService();

  const mediaRepository =
    'mediaRepository' in deps
      ? deps.mediaRepository ?? null
      : new MediaRepository(drizzleDb);

  const thumbnailRepository =
    'thumbnailRepository' in deps
      ? deps.thumbnailRepository ?? null
      : drizzleDb
        ? new ThumbnailRepository(drizzleDb)
        : null;

  const tautulliSnapshotRepository =
    'tautulliSnapshotRepository' in deps
      ? deps.tautulliSnapshotRepository ?? null
      : drizzleDb
        ? new TautulliSnapshotRepository(drizzleDb)
        : null;

  const seasonRepository =
    'seasonRepository' in deps
      ? deps.seasonRepository ?? null
      : drizzleDb
        ? new SeasonRepository(drizzleDb)
        : null;

  const castRepository =
    'castRepository' in deps
      ? deps.castRepository ?? null
      : drizzleDb
        ? new CastRepository(drizzleDb)
        : null;

  // Initialize new repositories for Tautulli sync
  const librarySectionRepo = new LibrarySectionRepository(drizzleDb);
  const syncScheduleRepo = new SyncScheduleRepository(drizzleDb);
  const tautulliConfigRepo = new TautulliConfigRepository(drizzleDb);

  if (!mediaRepository || !thumbnailRepository || !tautulliSnapshotRepository || !seasonRepository || !castRepository) {
    throw new Error('Database repositories are not configured.');
  }

  interface TautulliState {
    service: TautulliClient | null;
    syncService: TautulliSyncService | null;
    scheduler: SchedulerService | null;
  }

  const tautulliState: TautulliState = {
    service: tautulliService,
    syncService: null,
    scheduler: null,
  };

  const buildSyncService = (service: TautulliClient | null): TautulliSyncService | null => {
    if (!service) {
      return null;
    }

    if (
      typeof service.getLibraries !== 'function' ||
      typeof service.getLibraryMediaList !== 'function' ||
      typeof service.getMetadata !== 'function'
    ) {
      logger.warn('Tautulli client does not expose required methods; sync service will not start');
      return null;
    }

    return new TautulliSyncService(
      service as TautulliServiceClass,
      mediaRepository,
      seasonRepository,
      librarySectionRepo,
      tmdbService ?? undefined,
    );
  };

  const restartScheduler = (syncService: TautulliSyncService | null) => {
    if (tautulliState.scheduler) {
      tautulliState.scheduler.stop();
      tautulliState.scheduler = null;
      logger.info('Scheduler service stopped');
    }

    if (!syncService) {
      return;
    }

    tautulliState.scheduler = new SchedulerService(
      { enabled: true },
      syncScheduleRepo,
      syncService,
    );
    tautulliState.scheduler.start();
    logger.info('Scheduler service started');
  };

  const refreshTautulliIntegration = (input?: { baseUrl: string; apiKey: string }) => {
    const config = input ?? (() => {
      const stored = tautulliConfigRepo.get();
      if (!stored) {
        throw new Error('Tautulli is not configured.');
      }
      return { baseUrl: stored.tautulliUrl, apiKey: stored.apiKey };
    })();

    tautulliState.service = createTautulliService({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });
    tautulliService = tautulliState.service;

    logger.info('Tautulli service initialized', {
      source: input ? 'runtime' : 'stored',
      url: config.baseUrl,
    });

    tautulliState.syncService = buildSyncService(tautulliState.service);
    if (tautulliState.syncService) {
      logger.info('Tautulli sync service initialized');
    }

    restartScheduler(tautulliState.syncService);
  };

  // Attempt to build sync and scheduler services with existing configuration
  tautulliState.syncService = buildSyncService(tautulliState.service);
  if (tautulliState.syncService) {
    restartScheduler(tautulliState.syncService);
  } else if (!tautulliState.service) {
    const tautulliConfigFromTable = tautulliConfigRepo.get();
    if (tautulliConfigFromTable) {
      refreshTautulliIntegration({
        baseUrl: tautulliConfigFromTable.tautulliUrl,
        apiKey: tautulliConfigFromTable.apiKey,
      });
    }
  }

  const heroPipelineService = createHeroPipelineService({
    drizzleDatabase: drizzleDb,
    mediaRepository,
    thumbnailRepository,
    tmdbService,
    policyPath: appConfig.hero?.policyPath ?? null,
  });

  const authMiddleware = createAuthMiddleware({ token: appConfig.auth?.token ?? null });
  const basicAuthMiddleware = createBasicAuthMiddleware({
    username: appConfig.admin?.username ?? null,
    password: appConfig.admin?.password ?? null,
  });

  // Security headers with Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Needed for Swagger UI
        scriptSrc: ["'self'", "'unsafe-inline'"], // Needed for Swagger UI
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow embedding for development
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resource sharing
  }));

  // Enable CORS for frontend access
  app.use(cors({
    origin: appConfig.runtime.env === 'production'
      ? ['http://localhost:5500', 'http://127.0.0.1:5500'] // Live Server default ports
      : '*', // Allow all origins in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 86400, // Cache preflight requests for 24 hours
  }));

  app.use(express.json({ limit: '10mb' })); // Add body size limit for security
  app.use(requestLogger);

  // Setup API documentation
  setupSwagger(app);

  // Public routes (no auth required)
  app.use('/health', createHealthRouter(appConfig));
  app.use('/api/exports', createExportsRouter());
  app.use('/api/thumbnails', createThumbnailRouter({
    tautulliService: tautulliState.service as any
  }));
  if (heroPipelineService) {
    app.use('/api/hero', createHeroRouter({ heroPipeline: heroPipelineService }));
  }
  app.use('/api/v1', createV1Router({ mediaRepository, thumbnailRepository, seasonRepository, castRepository }));
  app.use('/api/watchlist', watchlistRouter);
  app.use('/api/welcome-email', welcomeEmailRouter);
  app.use('/api/newsletter', newsletterRouter);

  // Protected routes
  tautulliService = tautulliState.service;

  app.use(
    '/libraries',
    authMiddleware,
    createLibrariesRouter({ tautulliService: tautulliState.service, snapshotRepository: tautulliSnapshotRepository }),
  );
  app.use('/media', createMediaRouter({ mediaRepository, thumbnailRepository }));

  // Admin panel (protected with Basic Auth)
  app.use(
    '/admin',
    basicAuthMiddleware,
    createAdminRouter({
      config: appConfig,
      mediaRepository,
      thumbnailRepository,
      resendService,
      tautulliService: tautulliState.service,
      seasonRepository,
      castRepository,
      drizzleDatabase: drizzleDb ?? undefined,
      settingsRepository,
      tmdbManager,
      heroPipeline: heroPipelineService,
    }),
  );

  // Tautulli Sync routes (protected with Basic Auth)
  app.use(
    '/admin/api/tautulli',
    basicAuthMiddleware,
    createTautulliSyncRouter({
      getTautulliService: () => tautulliState.service,
      getTautulliSyncService: () => tautulliState.syncService,
      librarySectionRepo,
      syncScheduleRepo,
      tautulliConfigRepo,
      getSchedulerService: () => tautulliState.scheduler,
      refreshTautulliIntegration,
    }),
  );

  // Logging & error handling
  app.use(errorHandler);

  return app;
};

export default createServer;
