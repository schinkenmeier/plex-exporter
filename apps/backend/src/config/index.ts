import { z } from 'zod';

const DEFAULT_SQLITE_PATH = './data/exports/plex-exporter.sqlite';

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
    SMTP_HOST: optionalString,
    SMTP_PORT: optionalPort,
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    SMTP_FROM: optionalEmail,
    SMTP_SECURE: optionalBoolean,
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
  })
  .superRefine((env, ctx) => {
    const smtpFields = {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
    } as const;

    const hasSmtpConfiguration = Object.values(smtpFields).some((value) => value !== undefined);

    if (hasSmtpConfiguration) {
      if (!env.SMTP_HOST) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_HOST'],
          message: 'SMTP_HOST is required when configuring SMTP credentials.',
        });
      }

      if (!env.SMTP_PORT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_PORT'],
          message: 'SMTP_PORT is required when configuring SMTP credentials.',
        });
      }

      if (!env.SMTP_FROM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_FROM'],
          message: 'SMTP_FROM is required when configuring SMTP credentials.',
        });
      }
    }

    const hasPartialTautulliConfiguration = Boolean(env.TAUTULLI_URL) !== Boolean(env.TAUTULLI_API_KEY);

    if (hasPartialTautulliConfiguration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TAUTULLI_URL and TAUTULLI_API_KEY need to be provided together.',
        path: ['TAUTULLI_URL'],
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
  smtp: rawConfig.SMTP_HOST
    ? {
        host: rawConfig.SMTP_HOST,
        port: rawConfig.SMTP_PORT!,
        user: rawConfig.SMTP_USER,
        pass: rawConfig.SMTP_PASS,
        from: rawConfig.SMTP_FROM!,
        secure: rawConfig.SMTP_SECURE ?? false,
      }
    : null,
  tautulli: rawConfig.TAUTULLI_URL
    ? {
        url: rawConfig.TAUTULLI_URL,
        apiKey: rawConfig.TAUTULLI_API_KEY!,
      }
    : null,
} as const;

export type AppConfig = typeof config;
