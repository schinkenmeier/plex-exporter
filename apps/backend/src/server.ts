import 'dotenv/config';
import express from 'express';

import { config, type AppConfig } from './config/index.js';
import { createLibrariesRouter } from './routes/libraries.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createHealthRouter } from './routes/health.js';
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

  app.use(express.json());
  app.use('/health', createHealthRouter(appConfig));
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
