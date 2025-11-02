import { Request, Response, NextFunction } from 'express';
import { HttpError } from './errorHandler.js';

export interface BasicAuthOptions {
  username: string | null;
  password: string | null;
}

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
    // If no credentials configured, deny access
    if (!options.username || !options.password) {
      return next(
        new HttpError(
          503,
          'Admin panel is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD environment variables.',
        ),
      );
    }

    // Parse Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide valid credentials',
      });
    }

    // Decode credentials
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // Verify credentials
    if (username === options.username && password === options.password) {
      return next();
    }

    // Invalid credentials
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid username or password',
    });
  };
};

export default createBasicAuthMiddleware;
