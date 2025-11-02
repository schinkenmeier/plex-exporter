/**
 * In-Memory Log Buffer
 *
 * Stores recent log entries for display in the admin panel.
 * Implements a circular buffer with configurable size.
 */

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

class LogBuffer {
  private buffer: LogEntry[] = [];
  private maxSize: number;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  /**
   * Add a log entry to the buffer
   */
  add(entry: LogEntry): void {
    this.buffer.push(entry);

    // Remove oldest entries if buffer exceeds max size
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * Get all log entries (most recent last)
   */
  getAll(): LogEntry[] {
    return [...this.buffer];
  }

  /**
   * Get last N log entries
   */
  getLast(count: number): LogEntry[] {
    return this.buffer.slice(-count);
  }

  /**
   * Get log entries filtered by level
   */
  getByLevel(level: LogEntry['level']): LogEntry[] {
    return this.buffer.filter(entry => entry.level === level);
  }

  /**
   * Get log entries since a specific timestamp
   */
  getSince(timestamp: string): LogEntry[] {
    return this.buffer.filter(entry => entry.timestamp >= timestamp);
  }

  /**
   * Clear all log entries
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Get buffer statistics
   */
  getStats(): { total: number; byLevel: Record<string, number>; maxSize: number } {
    const byLevel: Record<string, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    for (const entry of this.buffer) {
      byLevel[entry.level] = (byLevel[entry.level] || 0) + 1;
    }

    return {
      total: this.buffer.length,
      byLevel,
      maxSize: this.maxSize,
    };
  }
}

// Global singleton instance
export const logBuffer = new LogBuffer(500);

export default logBuffer;
