import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import logger from '../services/logger.js';

export interface HttpErrorOptions extends ErrorOptions {
  details?: unknown;
  expose?: boolean;
}

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly expose: boolean;

  constructor(statusCode: number, message: string, options: HttpErrorOptions = {}) {
    super(message, options);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = options.details;
    this.expose = options.expose ?? true;
  }
}

const toErrorLog = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: error };
};

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    logger.info('Request completed', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number.isFinite(durationMs) ? Number(durationMs.toFixed(2)) : durationMs,
      contentLength: res.get('Content-Length') ?? undefined,
    });
  });

  next();
};

export interface ErrorResponseBody {
  error: {
    message: string;
    statusCode: number;
    details?: unknown;
  };
  meta: {
    timestamp: string;
    path: string;
    method: string;
  };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let message = 'Internal server error';
  let details: unknown;

  if (err instanceof HttpError) {
    statusCode = err.statusCode;
    if (err.expose) {
      message = err.message;
      details = err.details;
    }
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    details = err.flatten();
  } else if (typeof err === 'object' && err && 'status' in err && typeof (err as any).status === 'number') {
    statusCode = (err as any).status;
    if (typeof (err as any).message === 'string' && statusCode < 500) {
      message = (err as any).message;
    }
  } else if (err instanceof Error && err.message && statusCode < 500) {
    message = err.message;
  }

  logger.error('Request failed', {
    request: {
      method: req.method,
      path: req.originalUrl,
    },
    statusCode,
    error: toErrorLog(err),
  });

  const response: ErrorResponseBody = {
    error: {
      message,
      statusCode,
      ...(details !== undefined ? { details } : {}),
    },
    meta: {
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method,
    },
  };

  res.status(statusCode).json(response);
};

export default errorHandler;
