import type { AppConfig } from '../../config/index.js';
import SettingsRepository from '../../repositories/settingsRepository.js';
import type { TautulliConfigRepository } from '../../repositories/tautulliConfigRepository.js';
import type { MailSender } from '../../services/resendService.js';
import {
  resolveTautulliConfigStatus,
  type TautulliConfigStatus,
} from '../../services/tautulliConfigStatus.js';
import { maskSensitive } from './helpers.js';

export interface AdminResendStatusOptions {
  config: AppConfig;
  settingsRepository: SettingsRepository;
  resendService: MailSender | null;
  getResendService?: () => MailSender | null;
}

export interface AdminTautulliStatusOptions {
  config: AppConfig;
  settingsRepository: SettingsRepository;
  tautulliConfigRepository?: TautulliConfigRepository | null;
  getTautulliConfigStatus?: () => TautulliConfigStatus;
}

export const getActiveResendService = ({
  resendService,
  getResendService,
}: Pick<AdminResendStatusOptions, 'resendService' | 'getResendService'>): MailSender | null =>
  getResendService ? getResendService() : resendService;

export const getResolvedResendConfigStatus = ({
  config,
  settingsRepository,
  resendService,
  getResendService,
}: AdminResendStatusOptions) => {
  const apiKey = settingsRepository.get('resend.apiKey');
  const fromEmail = settingsRepository.get('resend.fromEmail');
  const hasDbConfig = Boolean(apiKey?.value && fromEmail?.value);
  const hasEnvConfig = Boolean(config.resend?.apiKey && config.resend?.fromEmail);
  const activeService = getActiveResendService({ resendService, getResendService });
  const source = hasEnvConfig ? 'environment' : hasDbConfig ? 'database' : 'unset';

  return {
    enabled: Boolean(activeService),
    source,
    fromEnv: hasEnvConfig,
    fromDatabase: !hasEnvConfig && hasDbConfig,
    envOverride: hasEnvConfig && hasDbConfig,
    apiKeyPreview: hasEnvConfig
      ? maskSensitive(config.resend?.apiKey ?? '')
      : apiKey?.value
        ? maskSensitive(apiKey.value)
        : null,
    fromEmail: hasEnvConfig ? config.resend?.fromEmail ?? null : fromEmail?.value || null,
    updatedAt: hasEnvConfig ? null : apiKey?.updatedAt || fromEmail?.updatedAt || null,
    saved: {
      apiKeyPreview: apiKey?.value ? maskSensitive(apiKey.value) : null,
      fromEmail: fromEmail?.value || null,
      updatedAt: apiKey?.updatedAt || fromEmail?.updatedAt || null,
    },
  };
};

export const getResolvedAdminTautulliConfigStatus = ({
  config,
  settingsRepository,
  tautulliConfigRepository,
  getTautulliConfigStatus,
}: AdminTautulliStatusOptions): TautulliConfigStatus => {
  if (getTautulliConfigStatus) {
    return getTautulliConfigStatus();
  }

  return resolveTautulliConfigStatus({
    envConfig: config.tautulli,
    tautulliConfigRepository,
    settingsRepository,
  });
};
