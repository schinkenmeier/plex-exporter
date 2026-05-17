import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type AppConfig, loadPersistedConfig } from './config/index.js';
import { createLibrariesRouter } from './routes/libraries.js';
import { createHealthRouter } from './routes/health.js';
import { createV1Router } from './routes/v1.js';
import { createWatchlistRouter } from './routes/watchlist.js';
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
import { createAdminRouter, type TautulliConfigSource, type TautulliConfigStatus } from './routes/admin.js';
import { createBasicAuthMiddleware } from './middleware/basicAuth.js';
import { createThumbnailRouter } from './routes/thumbnails.js';
import { createRateLimiters } from './middleware/rateLimiter.js';
import { closeSQLiteRateLimitStore, createSQLiteRateLimitStore } from './middleware/sqliteRateLimitStore.js';
import {
  createTautulliSyncRouter,
  DEFAULT_SNAPSHOT_LIMIT,
  SNAPSHOT_LIMIT_SETTING_KEY,
  parseSnapshotLimit,
} from './routes/tautulliSync.js';
import { TautulliSyncService } from './services/tautulliSyncService.js';
import { SchedulerService } from './services/schedulerService.js';
import { ImageStorageService } from './services/imageStorageService.js';
import logger from './services/logger.js';
import { SyncLiveMonitor } from './services/syncLiveMonitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export interface ServerRuntime {
  app: express.Express;
  appConfig: AppConfig;
  dispose(): void;
  getTautulliService(): TautulliClient | null;
  getTautulliSyncService(): TautulliSyncService | null;
  getSchedulerService(): SchedulerService | null;
}

const isServerRuntime = (value: AppConfig | ServerRuntime): value is ServerRuntime =>
  Boolean(value && typeof value === 'object' && 'dispose' in value && 'app' in value);

export function createRuntime(appConfig: AppConfig, deps: ServerDependencies = {}): ServerRuntime {
  const app = createServer(appConfig, deps);
  const runtime = app.locals.runtime as ServerRuntime | undefined;
  if (!runtime) {
    throw new Error('Server runtime was not attached to the Express app.');
  }
  return runtime;
}

export function createServer(runtime: ServerRuntime): express.Express;
export function createServer(appConfig: AppConfig, deps?: ServerDependencies): express.Express;
export function createServer(appConfigOrRuntime: AppConfig | ServerRuntime, deps: ServerDependencies = {}): express.Express {
  if (isServerRuntime(appConfigOrRuntime)) {
    return appConfigOrRuntime.app;
  }

  const appConfig = appConfigOrRuntime;
  const app = express();
  const ownsDatabase = !('database' in deps || 'drizzleDatabase' in deps);
  const adminUiDir = path.resolve(__dirname, '..', '..', 'frontend', 'public');
  if (!fs.existsSync(adminUiDir)) {
    throw new Error(
      `Admin UI Build fehlt unter ${adminUiDir}. Bitte 'npm run build --workspace @plex-exporter/frontend' ausführen.`,
    );
  }

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

  const resolvedDatabaseDir =
    appConfig.database.sqlitePath === ':memory:'
      ? null
      : path.dirname(path.resolve(appConfig.database.sqlitePath));
  const rateLimitDatabasePath = resolvedDatabaseDir
    ? path.join(resolvedDatabaseDir, 'rate-limit.sqlite')
    : null;

  const rateLimiters = createRateLimiters({
    createStore: rateLimitDatabasePath
      ? ({ limiterName, windowMs }) =>
          createSQLiteRateLimitStore({
            databasePath: rateLimitDatabasePath,
            windowMs,
            keyPrefix: limiterName,
          })
      : undefined,
  });

  const settingsRepository =
    'settingsRepository' in deps
      ? deps.settingsRepository ?? null
      : new SettingsRepository(drizzleDb);

  if (!settingsRepository) {
    throw new Error('Settings repository could not be initialised.');
  }

  // Load persisted configuration from database (supplements environment variables)
  const persistedConfig = loadPersistedConfig((key: string) => settingsRepository.get(key));
  const tautulliConfigRepo = new TautulliConfigRepository(drizzleDb);

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

  const resolveInitialTautulliConfig = (): { baseUrl: string; apiKey: string; source: string } | null => {
    if (appConfig.tautulli) {
      return {
        baseUrl: appConfig.tautulli.url,
        apiKey: appConfig.tautulli.apiKey,
        source: 'env',
      };
    }

    const storedConfig = tautulliConfigRepo.get();
    if (storedConfig) {
      return {
        baseUrl: storedConfig.tautulliUrl,
        apiKey: storedConfig.apiKey,
        source: 'tautulli_config',
      };
    }

    if (persistedConfig.tautulli) {
      return {
        baseUrl: persistedConfig.tautulli.url,
        apiKey: persistedConfig.tautulli.apiKey,
        source: 'legacy_settings',
      };
    }

    return null;
  };

  // Initialize Tautulli service with env, tautulli_config or legacy settings.
  let tautulliService =
    'tautulliService' in deps
      ? deps.tautulliService ?? null
      : null;

  if (!tautulliService) {
    const tautulliConfig = resolveInitialTautulliConfig();
    if (tautulliConfig) {
      tautulliService = createTautulliService({
        baseUrl: tautulliConfig.baseUrl,
        apiKey: tautulliConfig.apiKey,
      });
      logger.info('Tautulli service initialized', {
        source: tautulliConfig.source,
        url: tautulliConfig.baseUrl,
      });
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
        ? (() => {
            const storedSnapshotLimitSetting = settingsRepository.get(SNAPSHOT_LIMIT_SETTING_KEY);
            const parsedSnapshotLimit = storedSnapshotLimitSetting
              ? parseSnapshotLimit(storedSnapshotLimitSetting.value)
              : null;
            const snapshotRetentionLimit = parsedSnapshotLimit ?? DEFAULT_SNAPSHOT_LIMIT;
            return new TautulliSnapshotRepository(drizzleDb, {
              maxSnapshots: snapshotRetentionLimit,
            });
          })()
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
  const syncLiveMonitor = new SyncLiveMonitor();

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

    // Initialize ImageStorageService for downloading covers
    const imageStorageService = new ImageStorageService({
      tautulliService: service as TautulliServiceClass,
      exportsBasePath: undefined, // TODO: Add exports config to PersistedConfig if needed
    });

    return new TautulliSyncService(
      service as TautulliServiceClass,
      mediaRepository,
      seasonRepository,
      librarySectionRepo,
      tmdbService ?? undefined,
      imageStorageService,
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
      syncLiveMonitor,
    );
    tautulliState.scheduler.start();
    logger.info('Scheduler service started');
  };

  const refreshTautulliIntegration = (input?: { baseUrl: string; apiKey: string }) => {
    const config = (() => {
      if (appConfig.tautulli) {
        return {
          baseUrl: appConfig.tautulli.url,
          apiKey: appConfig.tautulli.apiKey,
          source: 'env',
        };
      }

      if (input) {
        return { ...input, source: 'runtime' };
      }

      const stored = tautulliConfigRepo.get();
      if (!stored) {
        if (persistedConfig.tautulli) {
          return {
            baseUrl: persistedConfig.tautulli.url,
            apiKey: persistedConfig.tautulli.apiKey,
            source: 'legacy_settings',
          };
        }
        return null;
      }

      return { baseUrl: stored.tautulliUrl, apiKey: stored.apiKey, source: 'tautulli_config' };
    })();

    if (!config) {
      tautulliState.service = null;
      tautulliState.syncService = null;
      restartScheduler(null);
      logger.info('Tautulli integration cleared');
      return;
    }

    tautulliState.service = createTautulliService({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });
    tautulliService = tautulliState.service;

    logger.info('Tautulli service initialized', {
      source: config.source,
      url: config.baseUrl,
    });

    tautulliState.syncService = buildSyncService(tautulliState.service);
    if (tautulliState.syncService) {
      logger.info('Tautulli sync service initialized');
    }

    restartScheduler(tautulliState.syncService);
  };

  const getTautulliConfigStatus = (): TautulliConfigStatus => {
    const stored = tautulliConfigRepo.get();
    const legacyUrl = settingsRepository.get('tautulli.url');
    const legacyApiKey = settingsRepository.get('tautulli.apiKey');
    const savedSource = stored
      ? 'tautulli_config'
      : legacyUrl || legacyApiKey
        ? 'legacy_settings'
        : 'unset';
    const savedUrl = stored?.tautulliUrl || legacyUrl?.value || null;
    const savedHasApiKey = Boolean(stored?.apiKey || legacyApiKey?.value);
    const activeSource: TautulliConfigSource = appConfig.tautulli ? 'env' : savedSource;

    return {
      configured: activeSource !== 'unset',
      source: activeSource,
      activeSource,
      fromEnv: Boolean(appConfig.tautulli),
      envOverride: Boolean(appConfig.tautulli) && savedSource !== 'unset',
      tautulliUrl: appConfig.tautulli?.url || savedUrl,
      hasApiKey: Boolean(appConfig.tautulli?.apiKey) || savedHasApiKey,
      saved: {
        source: savedSource,
        tautulliUrl: savedUrl,
        hasApiKey: savedHasApiKey,
      },
    };
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

  // Trust proxy when running behind Caddy reverse proxy
  // Use 'loopback' to only trust localhost/container networks
  if (appConfig.runtime.env === 'production') {
    app.set('trust proxy', 'loopback');
  }

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
    hsts: false, // TLS/HTTPS terminates via Cloudflare Tunnel; disable HSTS for direct HTTP access in LAN
    crossOriginEmbedderPolicy: false, // Allow embedding for development
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resource sharing
  }));

  // Enable CORS for frontend access
  app.use(cors({
    origin: appConfig.runtime.env === 'production'
      ? true // Allow same-origin requests when served through Caddy reverse proxy
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

  const adminDistDir = path.join(adminUiDir, 'dist');
  if (!fs.existsSync(adminDistDir)) {
    throw new Error(
      `Admin UI Assets (${adminDistDir}) nicht gefunden. Bitte 'npm run build --workspace @plex-exporter/frontend' ausführen.`,
    );
  }
  app.use(
    '/dist',
    express.static(adminDistDir, {
      maxAge: appConfig.runtime.env === 'production' ? '1d' : 0,
    }),
  );

  // Public routes (no auth required)
  app.use('/health', createHealthRouter(appConfig));
  app.use('/api/thumbnails', createThumbnailRouter({
    getTautulliService: () => tautulliState.service as any
  }));
  if (heroPipelineService) {
    app.use('/api/hero', createHeroRouter({ heroPipeline: heroPipelineService, heroLimiter: rateLimiters.heroLimiter }));
  }
  app.use('/api/v1', createV1Router({
    mediaRepository,
    thumbnailRepository,
    seasonRepository,
    castRepository,
    tmdbService,
    rateLimiters: {
      apiLimiter: rateLimiters.apiLimiter,
      searchLimiter: rateLimiters.searchLimiter,
    },
  }));
  app.use('/api/watchlist', createWatchlistRouter({ settingsRepository }));
  app.use('/api/welcome-email', welcomeEmailRouter);
  app.use('/api/newsletter', newsletterRouter);

  // Protected routes
  tautulliService = tautulliState.service;

  app.use(
    '/libraries',
    authMiddleware,
    createLibrariesRouter({ tautulliService: tautulliState.service, snapshotRepository: tautulliSnapshotRepository }),
  );
  app.use('/media', basicAuthMiddleware, createMediaRouter({ mediaRepository, thumbnailRepository }));

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
      getTautulliService: () => tautulliState.service,
      seasonRepository,
      castRepository,
      drizzleDatabase: drizzleDb ?? undefined,
      settingsRepository,
      tautulliConfigRepository: tautulliConfigRepo,
      tmdbManager,
      heroPipeline: heroPipelineService,
      refreshTautulliIntegration,
      getTautulliConfigStatus,
      adminUiDir,
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
      getTautulliConfigStatus,
      settingsRepository,
      tautulliSnapshotRepository: tautulliSnapshotRepository!,
      syncLiveMonitor,
    }),
  );

  // Logging & error handling
  app.use(errorHandler);

  let disposed = false;
  const runtime: ServerRuntime = {
    app,
    appConfig,
    getTautulliService: () => tautulliState.service,
    getTautulliSyncService: () => tautulliState.syncService,
    getSchedulerService: () => tautulliState.scheduler,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (tautulliState.scheduler) {
        tautulliState.scheduler.stop();
        tautulliState.scheduler = null;
      }
      if (ownsDatabase) {
        database.close();
        if (rateLimitDatabasePath) {
          closeSQLiteRateLimitStore(rateLimitDatabasePath);
        }
      }
    },
  };
  app.locals.runtime = runtime;

  return app;
}

export default createServer;
