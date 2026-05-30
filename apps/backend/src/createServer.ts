import express from 'express';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type AppConfig, loadPersistedConfig } from './config/index.js';
import { createLibrariesRouter } from './routes/libraries.js';
import { createHealthRouter } from './routes/health.js';
import { clearV1CatalogCaches, createV1ApiCaches, createV1Router, type V1ApiCaches } from './routes/v1.js';
import { createWatchlistRouter } from './routes/watchlist.js';
import welcomeEmailRouter from './routes/welcomeEmail.js';
import {
  adminNewsletterRouter,
  publicNewsletterRouter,
} from './routes/newsletter.js';
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
import createHeroPipelineService, { type HeroPipelineService } from './services/heroPipeline.js';
import { createHeroRouter } from './routes/hero.js';
import { setupSwagger } from './config/swaggerSetup.js';
import { createAdminRouter } from './routes/admin.js';
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
import { SyncCoordinator } from './services/syncCoordinator.js';
import type { TmdbService } from './services/tmdbService.js';
import {
  resolveActiveTautulliConfig,
  resolveTautulliConfigStatus,
  type TautulliConfigStatus,
} from './services/tautulliConfigStatus.js';

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

interface TautulliRuntimeState {
  service: TautulliClient | null;
  syncService: TautulliSyncService | null;
  scheduler: SchedulerService | null;
}

export interface ServerRuntime {
  app: express.Express;
  appConfig: AppConfig;
  adminUiDir: string | null;
  database: SqliteDatabase;
  drizzleDatabase: DrizzleDatabase;
  mediaRepository: MediaRepository;
  thumbnailRepository: ThumbnailRepository;
  tautulliSnapshotRepository: TautulliSnapshotRepository;
  seasonRepository: SeasonRepository;
  castRepository: CastRepository;
  librarySectionRepo: LibrarySectionRepository;
  syncScheduleRepo: SyncScheduleRepository;
  settingsRepository: SettingsRepository;
  tautulliConfigRepo: TautulliConfigRepository;
  tmdbManager: TmdbManager;
  tmdbService: TmdbService | null;
  resendService: MailSender | null;
  heroPipeline: HeroPipelineService;
  rateLimiters: ReturnType<typeof createRateLimiters>;
  v1ApiCaches: V1ApiCaches;
  syncLiveMonitor: SyncLiveMonitor;
  syncCoordinator: SyncCoordinator;
  tautulliState: TautulliRuntimeState;
  refreshTautulliIntegration(input?: { baseUrl: string; apiKey: string }): void;
  refreshResendIntegration(): MailSender | null;
  refreshTmdbIntegration(): TmdbService | null;
  getTautulliConfigStatus(): TautulliConfigStatus;
  dispose(): void;
  shutdown(options?: { syncDrainTimeoutMs?: number }): Promise<void>;
  getTautulliService(): TautulliClient | null;
  getResendService(): MailSender | null;
  getTmdbService(): TmdbService | null;
  getTautulliSyncService(): TautulliSyncService | null;
  getSchedulerService(): SchedulerService | null;
}

const isServerRuntime = (value: AppConfig | ServerRuntime): value is ServerRuntime =>
  Boolean(value && typeof value === 'object' && 'dispose' in value && 'app' in value);

const corsOrigin =
  (env: AppConfig['runtime']['env']): CorsOptions['origin'] =>
    env === 'production'
      ? false
      : '*';

export function createRuntime(appConfig: AppConfig, deps: ServerDependencies = {}): ServerRuntime {
  const ownsDatabase = !('database' in deps || 'drizzleDatabase' in deps);
  const adminUiMode = appConfig.runtime.adminUiMode ?? 'embedded';
  const adminUiDir = adminUiMode === 'embedded'
    ? path.resolve(__dirname, '..', '..', 'frontend', 'public')
    : null;
  if (adminUiMode === 'embedded' && adminUiDir && !fs.existsSync(adminUiDir)) {
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
  const v1ApiCaches = createV1ApiCaches();
  const invalidateV1CatalogCaches = (reason: string): void => {
    clearV1CatalogCaches(v1ApiCaches);
    logger.info('Invalidated v1 catalog API caches', { namespace: 'cache', reason });
  };

  const settingsRepository =
    'settingsRepository' in deps
      ? deps.settingsRepository ?? null
      : new SettingsRepository(drizzleDb);

  if (!settingsRepository) {
    throw new Error('Settings repository could not be initialised.');
  }

  const tautulliConfigRepo = new TautulliConfigRepository(drizzleDb);

  // Initialize Resend service with environment or persisted config
  let resendService =
    'resendService' in deps
      ? deps.resendService ?? null
      : null;
  let runtimeRef: ServerRuntime | null = null;

  const applyMailSender = (sender: MailSender | null): void => {
    watchlistEmailService.setMailSender(sender);
    welcomeEmailService.setMailSender(sender);
    newsletterService.setMailSender(sender);
  };

  const resolveActiveResendConfig = () => {
    if (appConfig.resend) {
      return { config: appConfig.resend, source: 'env' as const };
    }

    const currentPersistedConfig = loadPersistedConfig((key: string) => settingsRepository.get(key));
    if (currentPersistedConfig.resend) {
      return { config: currentPersistedConfig.resend, source: 'database' as const };
    }

    return null;
  };

  const refreshResendIntegration = (): MailSender | null => {
    if ('resendService' in deps) {
      resendService = deps.resendService ?? null;
    } else {
      const resolved = resolveActiveResendConfig();
      resendService = resolved ? createResendService(resolved.config) : null;
      if (resolved) {
        logger.info('Resend service initialized', {
          source: resolved.source,
          fromEmail: resolved.config.fromEmail,
        });
      } else {
        logger.info('Resend service disabled');
      }
    }

    applyMailSender(resendService);
    if (runtimeRef) {
      runtimeRef.resendService = resendService;
    }
    return resendService;
  };

  if (!resendService) {
    refreshResendIntegration();
  } else {
    applyMailSender(resendService);
  }

  // Initialize Tautulli service with env, tautulli_config or legacy settings.
  let tautulliService =
    'tautulliService' in deps
      ? deps.tautulliService ?? null
      : null;

  if (!tautulliService) {
    const tautulliConfig = resolveActiveTautulliConfig({
      envConfig: appConfig.tautulli,
      tautulliConfigRepository: tautulliConfigRepo,
      settingsRepository,
    });
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

  let tmdbService = tmdbManager.getService();

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

  const tautulliState: TautulliRuntimeState = {
    service: tautulliService,
    syncService: null,
    scheduler: null,
  };
  const syncLiveMonitor = new SyncLiveMonitor();
  const syncCoordinator = new SyncCoordinator(syncLiveMonitor);

  const heroPipelineService = createHeroPipelineService({
    drizzleDatabase: drizzleDb,
    mediaRepository,
    thumbnailRepository,
    tmdbService,
    policyPath: appConfig.hero?.policyPath ?? null,
  });

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
      { enabled: true, timezone: appConfig.scheduler.timezone },
      syncScheduleRepo,
      syncService,
      syncCoordinator,
      heroPipelineService,
      invalidateV1CatalogCaches,
    );
    tautulliState.scheduler.start();
    logger.info('Scheduler service started');
  };

  const refreshTautulliIntegration = (input?: { baseUrl: string; apiKey: string }) => {
    const config = (() => {
      if (appConfig.tautulli) {
        // Environment configuration intentionally stays authoritative; runtime input is only persisted for later use.
        return resolveActiveTautulliConfig({
          envConfig: appConfig.tautulli,
          tautulliConfigRepository: tautulliConfigRepo,
          settingsRepository,
        });
      }

      if (input) {
        return { ...input, source: 'runtime' };
      }

      return resolveActiveTautulliConfig({
        envConfig: null,
        tautulliConfigRepository: tautulliConfigRepo,
        settingsRepository,
      });
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

  const getTautulliConfigStatus = (): TautulliConfigStatus =>
    resolveTautulliConfigStatus({
      envConfig: appConfig.tautulli,
      tautulliConfigRepository: tautulliConfigRepo,
      settingsRepository,
    });

  const refreshTmdbIntegration = (): TmdbService | null => {
    tmdbService = tmdbManager.getService();
    heroPipelineService.setTmdbService(tmdbService);
    v1ApiCaches.tmdb.clear();

    if (tautulliState.service) {
      tautulliState.syncService = buildSyncService(tautulliState.service);
      restartScheduler(tautulliState.syncService);
    }

    if (runtimeRef) {
      runtimeRef.tmdbService = tmdbService;
    }

    logger.info('Refreshed TMDB integration', {
      namespace: 'tmdb',
      enabled: Boolean(tmdbService),
    });
    return tmdbService;
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

  let disposed = false;
  const runtime: ServerRuntime = {
    app: null as unknown as express.Express,
    appConfig,
    adminUiDir,
    database,
    drizzleDatabase: drizzleDb,
    mediaRepository,
    thumbnailRepository,
    tautulliSnapshotRepository,
    seasonRepository,
    castRepository,
    librarySectionRepo,
    syncScheduleRepo,
    settingsRepository,
    tautulliConfigRepo,
    tmdbManager,
    tmdbService,
    resendService,
    heroPipeline: heroPipelineService,
    rateLimiters,
    v1ApiCaches,
    syncLiveMonitor,
    syncCoordinator,
    tautulliState,
    refreshTautulliIntegration,
    refreshResendIntegration,
    refreshTmdbIntegration,
    getTautulliConfigStatus,
    getTautulliService: () => tautulliState.service,
    getResendService: () => resendService,
    getTmdbService: () => tmdbService,
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
      }
      if (rateLimitDatabasePath) {
        closeSQLiteRateLimitStore(rateLimitDatabasePath);
      }
    },
    shutdown: async ({ syncDrainTimeoutMs = 30_000 }: { syncDrainTimeoutMs?: number } = {}) => {
      if (disposed) return;
      if (tautulliState.scheduler) {
        tautulliState.scheduler.stop();
        tautulliState.scheduler = null;
      }

      const result = await syncCoordinator.shutdown({ timeoutMs: syncDrainTimeoutMs });
      if (!result.drained) {
        logger.warn('Timed out while waiting for active sync during shutdown', {
          namespace: 'sync-coordinator',
          timeoutMs: syncDrainTimeoutMs,
          activeRun: result.activeRun,
        });
      }

      runtime.dispose();
    },
  };
  runtimeRef = runtime;

  runtime.app = createServer(runtime);
  return runtime;
}

export function createServer(runtime: ServerRuntime): express.Express;
export function createServer(appConfig: AppConfig, deps?: ServerDependencies): express.Express;
export function createServer(appConfigOrRuntime: AppConfig | ServerRuntime, deps: ServerDependencies = {}): express.Express {
  if (!isServerRuntime(appConfigOrRuntime)) {
    return createRuntime(appConfigOrRuntime, deps).app;
  }

  const runtime = appConfigOrRuntime;
  if (runtime.app) {
    return runtime.app;
  }

  const {
    appConfig,
    adminUiDir,
    mediaRepository,
    thumbnailRepository,
    tautulliSnapshotRepository,
    seasonRepository,
    castRepository,
    librarySectionRepo,
    syncScheduleRepo,
    settingsRepository,
    tautulliConfigRepo,
    tmdbManager,
    resendService,
    heroPipeline,
    rateLimiters,
    v1ApiCaches,
    syncLiveMonitor,
    syncCoordinator,
    tautulliState,
    refreshTautulliIntegration,
    refreshResendIntegration,
    refreshTmdbIntegration,
    getTautulliConfigStatus,
    getResendService,
    getTmdbService,
  } = runtime;

  const app = express();
  const authMiddleware = createAuthMiddleware({ token: appConfig.auth?.token ?? null });
  const basicAuthMiddleware = createBasicAuthMiddleware({
    username: appConfig.admin?.username ?? null,
    password: appConfig.admin?.password ?? null,
    bearerToken: appConfig.admin?.apiToken ?? null,
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
    origin: corsOrigin(appConfig.runtime.env),
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 86400, // Cache preflight requests for 24 hours
  }));

  app.use(express.json({ limit: '10mb' })); // Add body size limit for security
  app.use(requestLogger);

  // Setup API documentation
  setupSwagger(app);

  if (adminUiDir) {
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
  }

  // Public routes (no auth required)
  app.use('/health', createHealthRouter(appConfig));
  app.use('/api/thumbnails', createThumbnailRouter({
    getTautulliService: () => tautulliState.service as any
  }));
  if (heroPipeline) {
    app.use('/api/hero', createHeroRouter({ heroPipeline, heroLimiter: rateLimiters.heroLimiter }));
  }
  app.use('/api/v1', createV1Router({
    mediaRepository,
    thumbnailRepository,
    seasonRepository,
    castRepository,
    getTmdbService,
    rateLimiters: {
      apiLimiter: rateLimiters.apiLimiter,
      searchLimiter: rateLimiters.searchLimiter,
    },
    caches: v1ApiCaches,
  }));
  app.use('/api/watchlist', createWatchlistRouter({
    settingsRepository,
    sendEmailLimiter: rateLimiters.publicMailLimiter,
  }));
  app.use('/api/newsletter', rateLimiters.publicMailLimiter, publicNewsletterRouter);

  // Protected routes
  app.use(
    '/libraries',
    authMiddleware,
    createLibrariesRouter({
      tautulliService: tautulliState.service,
      getTautulliService: () => tautulliState.service,
      snapshotRepository: tautulliSnapshotRepository,
    }),
  );
  app.use('/media', basicAuthMiddleware, createMediaRouter({ mediaRepository, thumbnailRepository }));

  // Admin-only email operations (protected with Basic Auth)
  app.use('/admin/api/welcome-email', basicAuthMiddleware, welcomeEmailRouter);
  app.use('/admin/api/newsletter', basicAuthMiddleware, adminNewsletterRouter);

  // Admin panel (protected with Basic Auth)
  app.use(
    '/admin',
    basicAuthMiddleware,
    createAdminRouter({
      config: appConfig,
      mediaRepository,
      thumbnailRepository,
      resendService,
      getResendService,
      tautulliService: tautulliState.service,
      getTautulliService: () => tautulliState.service,
      seasonRepository,
      castRepository,
      drizzleDatabase: runtime.drizzleDatabase,
      settingsRepository,
      tautulliConfigRepository: tautulliConfigRepo,
      tmdbManager,
      heroPipeline,
      refreshTautulliIntegration,
      refreshResendIntegration,
      refreshTmdbIntegration,
      getTautulliConfigStatus,
      adminUiDir,
      serveUi: Boolean(adminUiDir),
      adminAuthMethods: [
        ...(appConfig.admin?.username && appConfig.admin?.password ? ['basic' as const] : []),
        ...(appConfig.admin?.apiToken ? ['bearer' as const] : []),
      ],
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
      syncCoordinator,
      heroPipeline,
      invalidateCatalogCaches: (reason) => {
        clearV1CatalogCaches(v1ApiCaches);
        logger.info('Invalidated v1 catalog API caches', { namespace: 'cache', reason });
      },
    }),
  );

  // Logging & error handling
  app.use(errorHandler);

  runtime.app = app;
  app.locals.runtime = runtime;

  return app;
}

export default createServer;
