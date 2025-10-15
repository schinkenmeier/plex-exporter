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

export interface ServerDependencies {
  smtpService?: MailSender | null;
  tautulliService?: TautulliClient | null;
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

  app.use(express.json());
  app.use('/health', createHealthRouter(appConfig));
  app.use('/notifications', createNotificationsRouter({ smtpService }));
  app.use('/libraries', createLibrariesRouter({ tautulliService }));

  return app;
};

const appConfig = config;
const app = createServer(appConfig);

app.listen(appConfig.server.port, () => {
  console.log(`Plex Exporter backend listening on http://localhost:${appConfig.server.port}`);
});

export default app;
