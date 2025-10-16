import 'dotenv/config';
import { pathToFileURL } from 'node:url';

import { config } from './config/index.js';
import logger from './services/logger.js';
import { createServer } from './createServer.js';

export { createServer } from './createServer.js';
export type { ServerDependencies } from './createServer.js';

const appConfig = config;

export const startServer = () => {
  const app = createServer(appConfig);

  const server = app.listen(appConfig.server.port, () => {
    logger.info('Plex Exporter backend listening', {
      url: `http://localhost:${appConfig.server.port}`,
      port: appConfig.server.port,
    });
  });

  return server;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}

export default startServer;
