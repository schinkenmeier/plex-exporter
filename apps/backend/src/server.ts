import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { config, type AppConfig } from './config/index.js';
import { createLibrariesRouter } from './routes/libraries.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createHealthRouter } from './routes/health.js';
import { createExportsRouter } from './routes/exports.js';
import { createSmtpService, type MailSender } from './services/smtpService.js';
import {
  createTautulliService,
  type TautulliClient,
} from './services/tautulliService.js';
import { initializeDatabase, type SqliteDatabase } from './db/index.js';
import MediaRepository from './repositories/mediaRepository.js';
import ThumbnailRepository from './repositories/thumbnailRepository.js';
import TautulliSnapshotRepository from './repositories/tautulliSnapshotRepository.js';
import { createMediaRouter } from './routes/media.js';

export interface ServerDependencies {
  smtpService?: MailSender | null;
  tautulliService?: TautulliClient | null;
  database?: SqliteDatabase | null;
  mediaRepository?: MediaRepository | null;
  thumbnailRepository?: ThumbnailRepository | null;
  tautulliSnapshotRepository?: TautulliSnapshotRepository | null;
}

export const createServer = (appConfig: AppConfig, deps: ServerDependencies = {}) => {
  const app = express();

  const smtpService =
    'smtpService' in deps
      ? deps.smtpService ?? null
      : appConfig.smtp
        ? createSmtpService(appConfig.smtp)
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

  const database =
    'database' in deps
      ? deps.database ?? null
      : initializeDatabase({ filePath: appConfig.database.sqlitePath });

  const mediaRepository =
    'mediaRepository' in deps
      ? deps.mediaRepository ?? null
      : database
        ? new MediaRepository(database)
        : null;

  const thumbnailRepository =
    'thumbnailRepository' in deps
      ? deps.thumbnailRepository ?? null
      : database
        ? new ThumbnailRepository(database)
        : null;

  const tautulliSnapshotRepository =
    'tautulliSnapshotRepository' in deps
      ? deps.tautulliSnapshotRepository ?? null
      : database
        ? new TautulliSnapshotRepository(database)
        : null;

  if (!mediaRepository || !thumbnailRepository || !tautulliSnapshotRepository) {
    throw new Error('Database repositories are not configured.');
  }

  // Enable CORS for frontend access
  app.use(cors({
    origin: appConfig.runtime.env === 'production'
      ? ['http://localhost:5500', 'http://127.0.0.1:5500'] // Live Server default ports
      : '*', // Allow all origins in development
    credentials: true,
  }));

  app.use(express.json());

  // Public routes (no auth required)
  app.use('/health', createHealthRouter(appConfig));
  app.use('/api/exports', createExportsRouter());

  // Protected routes (could add auth middleware here later)
  app.use('/notifications', createNotificationsRouter({ smtpService }));
  app.use(
    '/libraries',
    createLibrariesRouter({ tautulliService, snapshotRepository: tautulliSnapshotRepository }),
  );
  app.use('/media', createMediaRouter({ mediaRepository, thumbnailRepository }));

  return app;
};

const appConfig = config;
const app = createServer(appConfig);

app.listen(appConfig.server.port, () => {
  console.log(`Plex Exporter backend listening on http://localhost:${appConfig.server.port}`);
});

export default app;
