import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { type AppConfig } from './config/index.js';
import { createLibrariesRouter } from './routes/libraries.js';
import { createHealthRouter } from './routes/health.js';
import { createExportsRouter } from './routes/exports.js';
import { createV1Router } from './routes/v1.js';
import {
  createTautulliService,
  type TautulliClient,
} from './services/tautulliService.js';
import { createResendService, type MailSender } from './services/resendService.js';
import {
  initializeDrizzleDatabase,
  type SqliteDatabase,
  type DrizzleDatabase,
} from './db/index.js';
import MediaRepository from './repositories/mediaRepository.js';
import ThumbnailRepository from './repositories/thumbnailRepository.js';
import TautulliSnapshotRepository from './repositories/tautulliSnapshotRepository.js';
import SeasonRepository from './repositories/seasonRepository.js';
import CastRepository from './repositories/castRepository.js';
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

  const resendService =
    'resendService' in deps
      ? deps.resendService ?? null
      : appConfig.resend
        ? createResendService(appConfig.resend)
        : null;

  const tautulliService =
    'tautulliService' in deps
      ? deps.tautulliService ?? null
      : appConfig.tautulli
        ? createTautulliService({
            baseUrl: appConfig.tautulli.url,
            apiKey: appConfig.tautulli.apiKey,
          })
        : null;

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

  const settingsRepository =
    'settingsRepository' in deps
      ? deps.settingsRepository ?? null
      : new SettingsRepository(drizzleDb);

  if (!settingsRepository) {
    throw new Error('Settings repository could not be initialised.');
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

  if (!mediaRepository || !thumbnailRepository || !tautulliSnapshotRepository || !seasonRepository || !castRepository) {
    throw new Error('Database repositories are not configured.');
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
  app.use('/api/thumbnails', createThumbnailRouter());
  if (heroPipelineService) {
    app.use('/api/hero', createHeroRouter({ heroPipeline: heroPipelineService }));
  }
  app.use('/api/v1', createV1Router({ mediaRepository, thumbnailRepository, seasonRepository, castRepository }));

  // Protected routes
  app.use(
    '/libraries',
    authMiddleware,
    createLibrariesRouter({ tautulliService, snapshotRepository: tautulliSnapshotRepository }),
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
      tautulliService,
      seasonRepository,
      castRepository,
      drizzleDatabase: drizzleDb ?? undefined,
      settingsRepository,
      tmdbManager,
      heroPipeline: heroPipelineService,
    }),
  );

  // Logging & error handling
  app.use(errorHandler);

  return app;
};

export default createServer;
