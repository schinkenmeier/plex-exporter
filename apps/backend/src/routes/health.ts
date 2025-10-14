import { Router } from 'express';
import type { HealthStatus } from '@plex-exporter/shared';

export interface HealthResponse extends HealthStatus {
  status: 'ok';
  timestamp: string;
}

const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const payload: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  res.json(payload);
});

export default healthRouter;
