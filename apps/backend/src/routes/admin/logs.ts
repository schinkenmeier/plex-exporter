import { Router, type Request, type Response } from 'express';
import { logBuffer } from '../../services/logBuffer.js';

const stringifyLogContext = (context: Record<string, unknown> | undefined): string => {
  if (!context) return '';
  try {
    return JSON.stringify(context).toLowerCase();
  } catch {
    return '';
  }
};

export const createAdminLogsRouter = (): Router => {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const parsedLimit = Number.parseInt(String(req.query.limit ?? ''), 10);
    const parsedOffset = Number.parseInt(String(req.query.offset ?? ''), 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 100;
    const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;
    const level = req.query.level as string;
    const since = req.query.since as string;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    let logs = logBuffer.getAll();

    if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
      logs = logs.filter(log => log.level === level);
    }

    if (since) {
      logs = logs.filter(log => log.timestamp >= since);
    }

    if (q) {
      logs = logs.filter(log => {
        const contextText = stringifyLogContext(log.context);
        return log.message.toLowerCase().includes(q) || contextText.includes(q);
      });
    }

    const total = logs.length;
    logs = [...logs]
      .reverse()
      .slice(offset, offset + limit);

    res.json({
      logs,
      stats: logBuffer.getStats(),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + logs.length < total,
        sort: 'newest-first',
      },
    });
  });

  router.delete('/', (_req: Request, res: Response) => {
    logBuffer.clear();
    res.json({ success: true, message: 'System logs cleared' });
  });

  return router;
};
