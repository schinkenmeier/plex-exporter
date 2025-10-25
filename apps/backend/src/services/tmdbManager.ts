import axios, { isAxiosError } from 'axios';

import createTmdbService, { type TmdbService } from './tmdbService.js';
import logger from './logger.js';

type TokenSource = 'env' | 'database' | 'unset';

export interface TmdbManagerStatus {
  hasToken: boolean;
  source: TokenSource;
  updatedAt: number | null;
  tokenPreview: string | null;
  fromEnv: boolean;
  fromDatabase: boolean;
}

export interface TmdbManagerOptions {
  envToken?: string | null;
  dbToken?: string | null;
  updatedAt?: number | null;
}

export interface SetDatabaseTokenOptions {
  updatedAt?: number | null;
}

export interface TmdbTestResult {
  success: true;
  status: number;
  message: string;
  tokenPreview: string;
  rateLimitRemaining: number | null;
}

export interface TmdbManager {
  getService(): TmdbService | null;
  getStatus(): TmdbManagerStatus;
  setDatabaseToken(token: string | null, options?: SetDatabaseTokenOptions): TmdbService | null;
  testToken(token?: string | null): Promise<TmdbTestResult>;
}

const CONFIGURATION_ENDPOINT = 'https://api.themoviedb.org/3/configuration';

const normalizeToken = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildPreview = (token: string): string => {
  if (token.length <= 8) return token;
  const head = token.slice(0, 4);
  const tail = token.slice(-4);
  return `${head}…${tail}`;
};

export const createTmdbManager = (options: TmdbManagerOptions = {}): TmdbManager => {
  const envToken = normalizeToken(options.envToken);
  let dbToken = normalizeToken(options.dbToken);

  let currentToken = dbToken ?? envToken ?? null;
  let source: TokenSource = dbToken ? 'database' : envToken ? 'env' : 'unset';
  let updatedAt = dbToken ? options.updatedAt ?? Date.now() : null;
  let service = currentToken ? createTmdbService({ accessToken: currentToken }) : null;

  const rebuild = (nextUpdatedAt: number | null = null) => {
    currentToken = dbToken ?? envToken ?? null;
    source = dbToken ? 'database' : envToken ? 'env' : 'unset';
    updatedAt = dbToken ? nextUpdatedAt ?? Date.now() : null;
    service = currentToken ? createTmdbService({ accessToken: currentToken }) : null;
    logger.info('TMDb access token updated', {
      namespace: 'tmdb',
      source,
    });
  };

  return {
    getService: () => service,
    getStatus: () => ({
      hasToken: Boolean(service),
      source,
      updatedAt,
      tokenPreview: currentToken ? buildPreview(currentToken) : null,
      fromEnv: source === 'env',
      fromDatabase: source === 'database',
    }),
    setDatabaseToken: (token: string | null, options?: SetDatabaseTokenOptions) => {
      dbToken = normalizeToken(token);
      rebuild(dbToken ? options?.updatedAt ?? Date.now() : null);
      return service;
    },
    testToken: async (token?: string | null) => {
      const candidate = normalizeToken(token ?? currentToken);
      if (!candidate) {
        const error = new Error('No TMDb access token available for testing.');
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      try {
        const response = await axios.get(CONFIGURATION_ENDPOINT, {
          headers: {
            Authorization: `Bearer ${candidate}`,
            Accept: 'application/json',
          },
        });
        const remainingHeader = response.headers['x-ratelimit-remaining'];
        const remaining =
          typeof remainingHeader === 'string' && remainingHeader.length > 0
            ? Number.parseInt(remainingHeader, 10)
            : null;
        return {
          success: true as const,
          status: response.status,
          message: 'Token accepted by TMDb.',
          tokenPreview: buildPreview(candidate),
          rateLimitRemaining: Number.isNaN(remaining) ? null : remaining,
        };
      } catch (error) {
        if (isAxiosError(error) && error.response) {
          const status = error.response.status;
          const message =
            typeof error.response.data?.status_message === 'string'
              ? error.response.data.status_message
              : status === 401 || status === 403
                ? 'TMDb rejected the provided token.'
                : 'TMDb request failed.';
          const err = new Error(message);
          (err as Error & { status?: number }).status = status;
          throw err;
        }
        throw error;
      }
    },
  };
};

export default createTmdbManager;
