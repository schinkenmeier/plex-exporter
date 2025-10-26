import { z } from 'zod';

const DEFAULT_SQLITE_PATH = '../../data/sqlite/plex-exporter.sqlite';

const optionalString = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length === 0 ? undefined : trimmed;
  },
  z.string().min(1).optional(),
);

const optionalEmail = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length === 0 ? undefined : trimmed;
  },
  z.string().email().optional(),
);

const optionalPort = z.preprocess(
  (value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (trimmed.length === 0) {
        return undefined;
      }

      const portNumber = Number.parseInt(trimmed, 10);

      if (Number.isNaN(portNumber)) {
        return NaN;
      }

      return portNumber;
    }

    return value;
  },
  z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional(),
);

const optionalBoolean = z.preprocess(
  (value) => {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();

      if (normalized.length === 0) {
        return undefined;
      }

      if (normalized === 'true') {
        return true;
      }

      if (normalized === 'false') {
        return false;
      }

      return value;
    }

    return value;
  },
  z.boolean().optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    SQLITE_PATH: z
      .string()
      .trim()
      .min(1, 'SQLITE_PATH must not be empty')
      .default(DEFAULT_SQLITE_PATH),
    HERO_POLICY_PATH: optionalString,
    TMDB_ACCESS_TOKEN: optionalString,
    API_TOKEN: optionalString,
    TAUTULLI_URL: z
      .preprocess(
        (value) => {
          if (typeof value !== 'string') {
            return value;
          }

          const trimmed = value.trim();

          return trimmed.length === 0 ? undefined : trimmed;
        },
        z.string().url().optional(),
      ),
    TAUTULLI_API_KEY: optionalString,
    ADMIN_USERNAME: optionalString,
    ADMIN_PASSWORD: optionalString,
    RESEND_API_KEY: optionalString,
    RESEND_FROM_EMAIL: optionalEmail,
  })
  .superRefine((env, ctx) => {
    const hasPartialTautulliConfiguration = Boolean(env.TAUTULLI_URL) !== Boolean(env.TAUTULLI_API_KEY);

    if (hasPartialTautulliConfiguration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TAUTULLI_URL and TAUTULLI_API_KEY need to be provided together.',
        path: ['TAUTULLI_URL'],
      });
    }

    const hasPartialAdminConfiguration = Boolean(env.ADMIN_USERNAME) !== Boolean(env.ADMIN_PASSWORD);

    if (hasPartialAdminConfiguration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ADMIN_USERNAME and ADMIN_PASSWORD need to be provided together.',
        path: ['ADMIN_USERNAME'],
      });
    }

    const hasPartialResendConfiguration = Boolean(env.RESEND_API_KEY) !== Boolean(env.RESEND_FROM_EMAIL);

    if (hasPartialResendConfiguration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'RESEND_API_KEY and RESEND_FROM_EMAIL need to be provided together.',
        path: ['RESEND_API_KEY'],
      });
    }
  });

const rawConfig = envSchema.parse(process.env);

export const config = {
  runtime: {
    env: rawConfig.NODE_ENV,
  },
  server: {
    port: rawConfig.PORT,
  },
  auth: rawConfig.API_TOKEN
    ? {
        token: rawConfig.API_TOKEN,
      }
    : null,
  database: {
    sqlitePath: rawConfig.SQLITE_PATH,
  },
  hero: {
    policyPath: rawConfig.HERO_POLICY_PATH || null,
  },
  tautulli: rawConfig.TAUTULLI_URL
    ? {
        url: rawConfig.TAUTULLI_URL,
        apiKey: rawConfig.TAUTULLI_API_KEY!,
      }
    : null,
  tmdb: rawConfig.TMDB_ACCESS_TOKEN
    ? {
        accessToken: rawConfig.TMDB_ACCESS_TOKEN,
      }
    : null,
  admin: rawConfig.ADMIN_USERNAME && rawConfig.ADMIN_PASSWORD
    ? {
        username: rawConfig.ADMIN_USERNAME,
        password: rawConfig.ADMIN_PASSWORD,
      }
    : null,
  resend: rawConfig.RESEND_API_KEY && rawConfig.RESEND_FROM_EMAIL
    ? {
        apiKey: rawConfig.RESEND_API_KEY,
        fromEmail: rawConfig.RESEND_FROM_EMAIL,
      }
    : null,
} as const;

export type AppConfig = typeof config;
