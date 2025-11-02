/**
 * Rate limiter for Tautulli API calls
 * Implements a queue-based rate limiting strategy to prevent overwhelming the Tautulli API
 */

export interface RateLimitConfig {
  requestsPerSecond: number;
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  pauseAfterRequests?: number;
  pauseDurationMs?: number;
}

interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retryCount: number;
}

export class TautulliRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'TautulliRateLimitError';
  }
}

export class TautulliRateLimiter {
  private queue: QueuedRequest<unknown>[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private requestCount = 0;
  private readonly minDelay: number;

  constructor(private readonly config: RateLimitConfig) {
    this.minDelay = 1000 / config.requestsPerSecond;
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        retryCount: 0,
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      try {
        // Wait for minimum delay between requests
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minDelay) {
          await this.sleep(this.minDelay - timeSinceLastRequest);
        }

        // Check if we need to pause after a batch of requests
        if (
          this.config.pauseAfterRequests &&
          this.config.pauseDurationMs &&
          this.requestCount >= this.config.pauseAfterRequests
        ) {
          await this.sleep(this.config.pauseDurationMs);
          this.requestCount = 0;
        }

        this.lastRequestTime = Date.now();
        this.requestCount++;

        const result = await item.fn();
        item.resolve(result);
      } catch (error) {
        // Handle rate limit errors with exponential backoff
        if (error instanceof TautulliRateLimitError || this.isRateLimitError(error)) {
          if (item.retryCount < this.config.maxRetries) {
            const backoffMs = Math.min(
              this.config.initialBackoffMs * Math.pow(2, item.retryCount),
              this.config.maxBackoffMs,
            );

            await this.sleep(backoffMs);

            // Re-queue with incremented retry count
            this.queue.unshift({
              ...item,
              retryCount: item.retryCount + 1,
            });
            continue;
          }
        }

        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.processing = false;
  }

  private isRateLimitError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response?: { status?: number } }).response;
      return response?.status === 429;
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Check if the limiter is currently processing
   */
  isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Get the number of requests processed since last pause
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Clear the queue (useful for testing or emergency stops)
   */
  clearQueue(): void {
    this.queue.forEach((item) => {
      item.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    this.requestCount = 0;
  }
}

/**
 * Create a rate limiter with default settings for Tautulli
 */
export function createTautulliRateLimiter(
  overrides?: Partial<RateLimitConfig>,
): TautulliRateLimiter {
  const defaultConfig: RateLimitConfig = {
    requestsPerSecond: 5,
    maxRetries: 5,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    pauseAfterRequests: 50,
    pauseDurationMs: 10000,
  };

  return new TautulliRateLimiter({ ...defaultConfig, ...overrides });
}
