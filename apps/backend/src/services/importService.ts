import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from './logger.js';

export interface ImportOptions {
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  moviesOnly?: boolean;
  seriesOnly?: boolean;
}

export interface ImportStatus {
  running: boolean;
  pid?: number;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  logs: string[];
  error?: string;
}

/**
 * Import Service
 *
 * Manages spawning and monitoring of the import-exports.ts script.
 * Only one import process can run at a time.
 */
class ImportService {
  private currentProcess: ChildProcess | null = null;
  private status: ImportStatus = {
    running: false,
    logs: [],
  };

  /**
   * Start an import process
   */
  async start(options: ImportOptions = {}): Promise<{ success: boolean; message: string }> {
    if (this.currentProcess) {
      return {
        success: false,
        message: 'Import process is already running',
      };
    }

    try {
      // Build command arguments
      const args: string[] = [];
      if (options.dryRun) args.push('--dry-run');
      if (options.force) args.push('--force');
      if (options.verbose) args.push('--verbose');
      if (options.moviesOnly) args.push('--movies-only');
      if (options.seriesOnly) args.push('--series-only');

      // Resolve script path
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      // Use compiled JavaScript file instead of TypeScript
      const scriptPath = path.join(__dirname, '..', 'scripts', 'import-exports.js');

      logger.info('Starting import process', { scriptPath, args });

      // Reset status
      this.status = {
        running: true,
        startedAt: new Date().toISOString(),
        logs: [],
      };

      // Spawn process using node (not tsx)
      this.currentProcess = spawn('node', [scriptPath, ...args], {
        cwd: path.join(__dirname, '..', '..'),
        env: process.env,
        stdio: 'pipe',
      });

      this.status.pid = this.currentProcess.pid;

      // Capture stdout
      this.currentProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        this.status.logs.push(...lines);
        logger.debug('[Import stdout]', { lines });
      });

      // Capture stderr
      this.currentProcess.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        this.status.logs.push(...lines);
        logger.warn('[Import stderr]', { lines });
      });

      // Handle process exit
      this.currentProcess.on('exit', (code) => {
        this.status.running = false;
        this.status.exitCode = code ?? undefined;
        this.status.finishedAt = new Date().toISOString();

        if (code === 0) {
          logger.info('Import process completed successfully', { exitCode: code });
        } else {
          logger.error('Import process failed', { exitCode: code });
          this.status.error = `Process exited with code ${code}`;
        }

        this.currentProcess = null;
      });

      // Handle process errors
      this.currentProcess.on('error', (error) => {
        this.status.running = false;
        this.status.error = error.message;
        this.status.finishedAt = new Date().toISOString();
        logger.error('Import process error', { error: error.message });
        this.currentProcess = null;
      });

      return {
        success: true,
        message: 'Import process started',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to start import process', { error: message });

      this.status.running = false;
      this.status.error = message;
      this.currentProcess = null;

      return {
        success: false,
        message: `Failed to start import: ${message}`,
      };
    }
  }

  /**
   * Stop the running import process
   */
  stop(): { success: boolean; message: string } {
    if (!this.currentProcess) {
      return {
        success: false,
        message: 'No import process is running',
      };
    }

    try {
      this.currentProcess.kill('SIGTERM');
      logger.info('Import process stop requested', { pid: this.currentProcess.pid });

      return {
        success: true,
        message: 'Import process stop requested',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to stop import process', { error: message });

      return {
        success: false,
        message: `Failed to stop import: ${message}`,
      };
    }
  }

  /**
   * Get current import status
   */
  getStatus(): ImportStatus {
    return {
      ...this.status,
      logs: [...this.status.logs], // Return a copy
    };
  }

  /**
   * Clear import logs
   */
  clearLogs(): void {
    this.status.logs = [];
  }
}

// Global singleton instance
export const importService = new ImportService();

export default importService;
