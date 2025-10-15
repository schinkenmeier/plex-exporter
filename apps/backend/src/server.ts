import 'dotenv/config';
import express from 'express';

import { config, type AppConfig } from './config/index.js';
import { createHealthRouter } from './routes/health.js';

export const createServer = (appConfig: AppConfig) => {
  const app = express();

  app.use(express.json());
  app.use('/health', createHealthRouter(appConfig));

  return app;
};

const appConfig = config;
const app = createServer(appConfig);

app.listen(appConfig.server.port, () => {
  console.log(`Plex Exporter backend listening on http://localhost:${appConfig.server.port}`);
});

export default app;
