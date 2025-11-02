import { Router } from 'express';
import type { HealthStatus } from '@plex-exporter/shared';

import type { AppConfig } from '../config/index.js';

export interface HealthResponse extends HealthStatus {
  status: 'ok';
  timestamp: string;
  environment: AppConfig['runtime']['env'];
}

export const createHealthRouter = (config: AppConfig) => {
  const router = Router();

  router.get('/', (_req, res) => {
    const payload: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.runtime.env,
    };

    res.json(payload);
  });

  return router;
};

export default createHealthRouter;
