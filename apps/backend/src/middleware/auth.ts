import type { RequestHandler } from 'express';

import { HttpError } from './errorHandler.js';

export interface AuthMiddlewareOptions {
  token: string | null | undefined;
}

const AUTHENTICATION_SCHEME = 'Bearer realm="Plex Exporter"';

const isValidBearer = (headerValue: string | undefined, token: string) => {
  if (!headerValue) {
    return false;
  }

  const [scheme, credentials] = headerValue.split(/\s+/, 2);

  if (!scheme || !credentials) {
    return false;
  }

  return scheme.toLowerCase() === 'bearer' && credentials === token;
};

const isValidApiKeyHeader = (headerValue: string | undefined, token: string) =>
  typeof headerValue === 'string' && headerValue === token;

export const createAuthMiddleware = ({ token }: AuthMiddlewareOptions): RequestHandler => {
  if (!token) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const authorization = req.get('Authorization');
    const apiKey = req.get('X-API-Key') ?? req.get('X-Api-Key');

    if (isValidBearer(authorization, token) || isValidApiKeyHeader(apiKey, token)) {
      return next();
    }

    res.setHeader('WWW-Authenticate', AUTHENTICATION_SCHEME);
    next(new HttpError(401, 'Unauthorized'));
  };
};

export default createAuthMiddleware;
