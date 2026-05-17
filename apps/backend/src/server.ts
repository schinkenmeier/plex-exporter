import 'dotenv/config';
import type { Server as HttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import { config } from './config/index.js';
import type { AppConfig } from './config/index.js';
import logger from './services/logger.js';
import { createRuntime, createServer } from './createServer.js';
import type { ServerDependencies, ServerRuntime } from './createServer.js';

export { createRuntime, createServer } from './createServer.js';
export type { ServerDependencies, ServerRuntime } from './createServer.js';

const appConfig = config;

export interface StartServerOptions {
  appConfig?: AppConfig;
  deps?: ServerDependencies;
  registerSignalHandlers?: boolean;
  exitProcessOnSignal?: boolean;
}

export interface StartServerHandle {
  server: HttpServer;
  runtime: ServerRuntime;
  close(callback?: (err?: Error) => void): HttpServer;
  shutdown(signal?: NodeJS.Signals): Promise<void>;
}

export const startServer = (options: StartServerOptions = {}): StartServerHandle => {
  const resolvedConfig = options.appConfig ?? appConfig;
  const runtime = createRuntime(resolvedConfig, options.deps ?? {});
  const app = createServer(runtime);
  let disposed = false;

  const server = app.listen(resolvedConfig.server.port, () => {
    logger.info('Plex Exporter backend listening', {
      url: `http://localhost:${resolvedConfig.server.port}`,
      port: resolvedConfig.server.port,
    });
  });

  const disposeRuntime = () => {
    if (disposed) return;
    disposed = true;
    runtime.dispose();
  };

  const shutdown = (signal?: NodeJS.Signals): Promise<void> =>
    new Promise((resolve, reject) => {
      if (signal) {
        logger.info('Received shutdown signal', { signal });
      }

      if (!server.listening) {
        disposeRuntime();
        resolve();
        return;
      }

      server.close((error) => {
        disposeRuntime();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  const handleSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal)
      .then(() => {
        if (options.exitProcessOnSignal ?? resolvedConfig.runtime.env !== 'test') {
          process.exit(0);
        }
      })
      .catch((error) => {
        logger.error('Failed to shut down cleanly', {
          signal,
          error: error instanceof Error ? error.message : error,
        });
        if (options.exitProcessOnSignal ?? resolvedConfig.runtime.env !== 'test') {
          process.exit(1);
        }
      });
  };

  const registerSignalHandlers =
    options.registerSignalHandlers ?? resolvedConfig.runtime.env !== 'test';
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  if (registerSignalHandlers) {
    for (const signal of signals) {
      process.once(signal, handleSignal);
    }
  }

  server.once('close', () => {
    disposeRuntime();
    if (registerSignalHandlers) {
      for (const signal of signals) {
        process.off(signal, handleSignal);
      }
    }
  });

  return {
    server,
    runtime,
    close: (callback?: (err?: Error) => void) => server.close(callback),
    shutdown,
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}

export default startServer;
