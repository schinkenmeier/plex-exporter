import { Router, type Request, type Response } from 'express';
import { logBuffer } from '../../services/logBuffer.js';

export const createAdminLogsRouter = (): Router => {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const level = req.query.level as string;
    const since = req.query.since as string;

    let logs = logBuffer.getAll();

    if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
      logs = logs.filter(log => log.level === level);
    }

    if (since) {
      logs = logs.filter(log => log.timestamp >= since);
    }

    logs = logs.slice(-limit);

    res.json({
      logs,
      stats: logBuffer.getStats(),
    });
  });

  router.delete('/', (_req: Request, res: Response) => {
    logBuffer.clear();
    res.json({ success: true, message: 'System logs cleared' });
  });

  return router;
};
