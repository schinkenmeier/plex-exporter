import rateLimit, { type Store } from 'express-rate-limit';
import type { Request, Response, RequestHandler } from 'express';

export interface RateLimiterFactoryOptions {
  createStore?: (options: { limiterName: RateLimiterName; windowMs: number }) => Store | undefined;
}

export type RateLimiterName = 'api' | 'search' | 'hero';

export interface RateLimiterSet {
  apiLimiter: RequestHandler;
  searchLimiter: RequestHandler;
  heroLimiter: RequestHandler;
}

const createHandler =
  (message: string) => (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message,
      retryAfter: res.getHeader('RateLimit-Reset'),
    });
  };

const buildLimiter = (
  limiterName: RateLimiterName,
  windowMs: number,
  max: number,
  message: string,
  storeFactory?: RateLimiterFactoryOptions['createStore'],
) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createHandler(message),
  store: storeFactory?.({ limiterName, windowMs }),
});

export const createRateLimiters = (options: RateLimiterFactoryOptions = {}): RateLimiterSet => {
  const { createStore } = options;
  return {
    apiLimiter: buildLimiter(
      'api',
      15 * 60 * 1000,
      100,
      'You have exceeded the rate limit. Please try again later.',
      createStore,
    ),
    searchLimiter: buildLimiter(
      'search',
      1 * 60 * 1000,
      30,
      'Search rate limit exceeded. Please slow down your requests.',
      createStore,
    ),
    heroLimiter: buildLimiter(
      'hero',
      5 * 60 * 1000,
      10,
      'Hero pipeline rate limit exceeded. This endpoint is resource-intensive.',
      createStore,
    ),
  };
};

const defaultLimiters = createRateLimiters();

export const apiLimiter = defaultLimiters.apiLimiter;
export const searchLimiter = defaultLimiters.searchLimiter;
export const heroLimiter = defaultLimiters.heroLimiter;
