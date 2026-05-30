import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { HttpError } from './errorHandler.js';

export interface BasicAuthOptions {
  username: string | null;
  password: string | null;
  bearerToken?: string | null;
}

const safeEqual = (actual: string | undefined, expected: string | null | undefined): boolean => {
  if (!actual || !expected) {
    return false;
  }

  const actualHash = crypto.createHash('sha256').update(actual).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(actualHash, expectedHash);
};

const parseBearer = (authHeader: string | undefined): string | null => {
  if (!authHeader) {
    return null;
  }

  const [scheme, credentials] = authHeader.split(/\s+/, 2);
  if (!scheme || !credentials || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return credentials;
};

/**
 * Basic Authentication Middleware
 *
 * Protects routes with HTTP Basic Auth.
 * If username/password are not configured, access is denied.
 *
 * @example
 * ```typescript
 * const basicAuth = createBasicAuthMiddleware({
 *   username: 'admin',
 *   password: 'secret123'
 * });
 * app.use('/admin', basicAuth, adminRouter);
 * ```
 */
export const createBasicAuthMiddleware = (options: BasicAuthOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const hasBasicAuth = Boolean(options.username && options.password);
    const hasBearerAuth = Boolean(options.bearerToken);

    // If no credentials configured, deny access
    if (!hasBasicAuth && !hasBearerAuth) {
      return next(
        new HttpError(
          503,
          'Admin access is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD or ADMIN_API_TOKEN environment variables.',
        ),
      );
    }

    // Parse Authorization header
    const authHeader = req.headers.authorization;

    const bearerToken = parseBearer(authHeader);
    if (bearerToken && safeEqual(bearerToken, options.bearerToken)) {
      res.locals.adminAuthMethod = 'bearer';
      return next();
    }

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader(
        'WWW-Authenticate',
        hasBasicAuth ? 'Basic realm="Admin Panel"' : 'Bearer realm="Admin API"',
      );
      return next(new HttpError(401, 'Authentication required'));
    }

    // Decode credentials
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // Verify credentials
    if (safeEqual(username, options.username) && safeEqual(password, options.password)) {
      res.locals.adminAuthMethod = 'basic';
      return next();
    }

    // Invalid credentials
    res.setHeader(
      'WWW-Authenticate',
      hasBasicAuth ? 'Basic realm="Admin Panel"' : 'Bearer realm="Admin API"',
    );
    return next(new HttpError(401, 'Authentication failed'));
  };
};

export default createBasicAuthMiddleware;
