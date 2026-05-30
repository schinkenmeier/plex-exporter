import { Router, type Request, type Response } from 'express';
import os from 'node:os';
import { formatBytes, formatUptime } from './helpers.js';

const startTime = Date.now();

export const createAdminSystemStatusRouter = (): Router => {
  const router = Router();

  router.get('/status', (_req: Request, res: Response) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const memoryUsage = process.memoryUsage();

    res.json({
      status: 'ok',
      uptime: {
        seconds: uptime,
        formatted: formatUptime(uptime),
      },
      memory: {
        rss: formatBytes(memoryUsage.rss),
        heapTotal: formatBytes(memoryUsage.heapTotal),
        heapUsed: formatBytes(memoryUsage.heapUsed),
        external: formatBytes(memoryUsage.external),
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cpus: os.cpus().length,
        totalMemory: formatBytes(os.totalmem()),
        freeMemory: formatBytes(os.freemem()),
      },
      process: {
        pid: process.pid,
        cwd: process.cwd(),
      },
    });
  });

  return router;
};
