import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import type { AppConfig } from '../../config/index.js';
import SettingsRepository from '../../repositories/settingsRepository.js';
import type { TautulliConfigRepository } from '../../repositories/tautulliConfigRepository.js';
import type { MailSender } from '../../services/resendService.js';
import type { TmdbManager } from '../../services/tmdbManager.js';
import type { TautulliConfigStatus } from '../../services/tautulliConfigStatus.js';
import { maskSensitive } from './helpers.js';
import {
  getResolvedAdminTautulliConfigStatus,
  getResolvedResendConfigStatus,
} from './configStatus.js';

export interface AdminRuntimeConfigRouterOptions {
  config: AppConfig;
  resendService: MailSender | null;
  getResendService?: () => MailSender | null;
  settingsRepository: SettingsRepository;
  tautulliConfigRepository?: TautulliConfigRepository | null;
  tmdbManager: TmdbManager;
  getTautulliConfigStatus?: () => TautulliConfigStatus;
}

export const createAdminRuntimeConfigRouter = ({
  config,
  resendService,
  getResendService,
  settingsRepository,
  tautulliConfigRepository,
  tmdbManager,
  getTautulliConfigStatus,
}: AdminRuntimeConfigRouterOptions): Router => {
  const router = Router();

  router.get('/config', (_req: Request, res: Response) => {
    const tmdbStatus = tmdbManager.getStatus();
    const tautulliStatus = getResolvedAdminTautulliConfigStatus({
      config,
      settingsRepository,
      tautulliConfigRepository,
      getTautulliConfigStatus,
    });
    const resendStatus = getResolvedResendConfigStatus({
      config,
      settingsRepository,
      resendService,
      getResendService,
    });

    res.json({
      runtime: {
        env: config.runtime.env,
      },
      server: {
        port: config.server.port,
      },
      auth: {
        enabled: !!config.auth,
        token: config.auth?.token ? maskSensitive(config.auth.token) : '[not set]',
      },
      database: {
        sqlitePath: config.database.sqlitePath,
        exists: fs.existsSync(config.database.sqlitePath),
      },
      hero: {
        policyPath: config.hero?.policyPath || '[not set]',
        policyExists: config.hero?.policyPath ? fs.existsSync(config.hero.policyPath) : false,
      },
      tautulli: {
        enabled: tautulliStatus.configured,
        url: tautulliStatus.tautulliUrl || '[not set]',
        apiKey: tautulliStatus.hasApiKey ? '****' : '[not set]',
        source: tautulliStatus.source,
        activeSource: tautulliStatus.activeSource,
        fromEnv: tautulliStatus.fromEnv,
        envOverride: tautulliStatus.envOverride,
        saved: tautulliStatus.saved,
      },
      tmdb: {
        enabled: tmdbStatus.hasToken,
        accessToken: tmdbStatus.hasToken ? tmdbStatus.tokenPreview ?? 'set' : null,
        source: tmdbStatus.source,
        updatedAt: tmdbStatus.updatedAt,
        fromEnv: tmdbStatus.fromEnv,
        fromDatabase: tmdbStatus.fromDatabase,
        envOverride: tmdbStatus.envOverride,
        saved: tmdbStatus.saved,
      },
      resend: {
        enabled: resendStatus.enabled,
        apiKey: resendStatus.apiKeyPreview ?? '[not set]',
        fromEmail: resendStatus.fromEmail || '[not set]',
        source: resendStatus.source,
        fromEnv: resendStatus.fromEnv,
        fromDatabase: resendStatus.fromDatabase,
        envOverride: resendStatus.envOverride,
        saved: resendStatus.saved,
      },
    });
  });

  return router;
};
