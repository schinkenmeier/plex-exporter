import type { AppConfig } from '../config/index.js';
import type SettingsRepository from '../repositories/settingsRepository.js';
import type { TautulliConfigRepository } from '../repositories/tautulliConfigRepository.js';

export type TautulliConfigSource = 'env' | 'tautulli_config' | 'legacy_settings' | 'unset';
export type SavedTautulliConfigSource = Exclude<TautulliConfigSource, 'env'>;

export interface TautulliConfigStatus {
  configured: boolean;
  source: TautulliConfigSource;
  activeSource: TautulliConfigSource;
  fromEnv: boolean;
  envOverride: boolean;
  tautulliUrl: string | null;
  hasApiKey: boolean;
  saved: {
    source: SavedTautulliConfigSource;
    tautulliUrl: string | null;
    hasApiKey: boolean;
  };
}

export interface ActiveTautulliConfig {
  baseUrl: string;
  apiKey: string;
  source: Exclude<TautulliConfigSource, 'unset'>;
}

interface ResolveTautulliConfigStatusOptions {
  envConfig?: AppConfig['tautulli'] | null;
  tautulliConfigRepository?: TautulliConfigRepository | null;
  settingsRepository: SettingsRepository;
}

export const resolveTautulliConfigStatus = ({
  envConfig,
  tautulliConfigRepository,
  settingsRepository,
}: ResolveTautulliConfigStatusOptions): TautulliConfigStatus => {
  const stored = tautulliConfigRepository?.get();
  const legacyUrl = settingsRepository.get('tautulli.url');
  const legacyApiKey = settingsRepository.get('tautulli.apiKey');
  const hasCompleteLegacyConfig = Boolean(legacyUrl?.value && legacyApiKey?.value);
  const savedSource: SavedTautulliConfigSource = stored
    ? 'tautulli_config'
    : hasCompleteLegacyConfig
      ? 'legacy_settings'
      : 'unset';
  const savedUrl = stored?.tautulliUrl || legacyUrl?.value || null;
  const savedHasApiKey = Boolean(stored?.apiKey || legacyApiKey?.value);
  const activeSource: TautulliConfigSource = envConfig ? 'env' : savedSource;

  return {
    configured: activeSource !== 'unset',
    source: activeSource,
    activeSource,
    fromEnv: Boolean(envConfig),
    envOverride: Boolean(envConfig) && savedSource !== 'unset',
    tautulliUrl: envConfig?.url || savedUrl,
    hasApiKey: Boolean(envConfig?.apiKey) || savedHasApiKey,
    saved: {
      source: savedSource,
      tautulliUrl: savedUrl,
      hasApiKey: savedHasApiKey,
    },
  };
};

export const resolveActiveTautulliConfig = ({
  envConfig,
  tautulliConfigRepository,
  settingsRepository,
}: ResolveTautulliConfigStatusOptions): ActiveTautulliConfig | null => {
  if (envConfig) {
    return {
      baseUrl: envConfig.url,
      apiKey: envConfig.apiKey,
      source: 'env',
    };
  }

  const stored = tautulliConfigRepository?.get();
  if (stored) {
    return {
      baseUrl: stored.tautulliUrl,
      apiKey: stored.apiKey,
      source: 'tautulli_config',
    };
  }

  const legacyUrl = settingsRepository.get('tautulli.url');
  const legacyApiKey = settingsRepository.get('tautulli.apiKey');
  if (legacyUrl?.value && legacyApiKey?.value) {
    return {
      baseUrl: legacyUrl.value,
      apiKey: legacyApiKey.value,
      source: 'legacy_settings',
    };
  }

  return null;
};
