/**
 * Simple structured logger for import scripts
 */

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

export interface LoggerOptions {
  verbose?: boolean;
  prefix?: string;
}

export class Logger {
  private verbose: boolean;
  private prefix: string;

  constructor(options: LoggerOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.prefix = options.prefix ?? '[import]';
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(7);
    return `${timestamp} ${this.prefix} ${levelStr} ${message}`;
  }

  info(message: string): void {
    console.log(this.formatMessage('info', message));
  }

  success(message: string): void {
    console.log(this.formatMessage('success', `✓ ${message}`));
  }

  warn(message: string): void {
    console.warn(this.formatMessage('warn', `⚠ ${message}`));
  }

  error(message: string, error?: Error): void {
    const msg = error ? `${message}: ${error.message}` : message;
    console.error(this.formatMessage('error', `✗ ${msg}`));
    if (this.verbose && error?.stack) {
      console.error(error.stack);
    }
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(this.formatMessage('debug', message));
    }
  }

  progress(current: number, total: number, item: string): void {
    const percentage = Math.round((current / total) * 100);
    const bar = this.createProgressBar(percentage);
    console.log(this.formatMessage('info', `${bar} ${current}/${total} - ${item}`));
  }

  private createProgressBar(percentage: number, width: number = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return `[${'='.repeat(filled)}${' '.repeat(empty)}] ${percentage}%`;
  }
}

export const createLogger = (options?: LoggerOptions): Logger => {
  return new Logger(options);
};
