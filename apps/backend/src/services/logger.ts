import util from 'node:util';
import { logBuffer, type LogEntry } from './logBuffer.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown> | undefined;
const REDACTED = '[redacted]';
const SENSITIVE_KEY_PATTERN = /(api[-_]?key|token|authorization|password|secret)/i;

const consoleMethod: Record<LogLevel, (message?: any, ...optionalParams: any[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const serialize = (context: LogContext) => {
  if (!context) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(
      context,
      (key, value) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return REDACTED;
        }

        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
          };
        }

        if (typeof value === 'bigint') {
          return value.toString();
        }

        return value;
      },
      2,
    ),
  );
};

class Logger {
  private format(level: LogLevel, message: string, context?: LogContext) {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...serialize(context),
    };
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    const payload = this.format(level, message, context);
    const method = consoleMethod[level];
    method(util.inspect(payload, { depth: null, colors: false, compact: false }));

    // Also add to log buffer for admin panel
    const logEntry: LogEntry = {
      timestamp: payload.timestamp,
      level,
      message,
      context: context ? serialize(context) : undefined,
    };
    logBuffer.add(logEntry);
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context);
  }
}

export const logger = new Logger();

export type AppLogger = Logger;

export default logger;
