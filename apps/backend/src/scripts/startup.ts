#!/usr/bin/env node
/**
 * Startup script for automatic database import
 * Runs before the main server starts
 *
 * This script:
 * 1. Checks if export files exist in /app/data/exports
 * 2. Checks if database is empty (no media items)
 * 3. Automatically imports data if available and database is empty
 * 4. Tracks last import to prevent duplicate imports
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { initializeDrizzleDatabase } from '../db/index.js';
import { createLogger } from './utils/logger.js';
import { createMovieImporter } from './importers/movieImporter.js';
import { createSeriesImporter } from './importers/seriesImporter.js';
import SettingsRepository from '../repositories/settingsRepository.js';
import { mediaItems } from '../db/schema.js';
import { count } from 'drizzle-orm';

const logger = createLogger({ verbose: true, prefix: '[startup]' });

async function checkIfDatabaseEmpty(db: any): Promise<boolean> {
  try {
    const result = db.select({ count: count() }).from(mediaItems).all();
    const mediaCount = result[0]?.count || 0;
    return mediaCount === 0;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`Could not check database content, assuming not empty: ${errorMsg}`);
    return false;
  }
}

async function performAutoImport(): Promise<boolean> {
  try {
    logger.info('=== Plex Exporter Startup Check ===');

    // Database setup
    const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), '..', '..', 'data', 'sqlite', 'plex-exporter.sqlite');
    logger.info(`Database: ${dbPath}`);

    const { sqlite: sqliteDb, db: drizzle } = initializeDrizzleDatabase({ filePath: dbPath });
    const settingsRepository = new SettingsRepository(drizzle);

    // Check if database is empty
    const isEmpty = await checkIfDatabaseEmpty(drizzle);

    if (!isEmpty) {
      logger.info('Database already contains media items, skipping auto-import');
      sqliteDb.close();
      return true;
    }

    logger.info('Database is empty, checking for export files...');

    // Check for export files
    const exportsPath = path.join(process.cwd(), '..', '..', 'data', 'exports');
    const moviesPath = path.join(exportsPath, 'movies', 'movies.json');
    const seriesIndexPath = path.join(exportsPath, 'series', 'series_index.json');

    const hasMovies = existsSync(moviesPath);
    const hasSeries = existsSync(seriesIndexPath);

    if (!hasMovies && !hasSeries) {
      logger.info('No export files found, skipping auto-import');
      logger.info(`Checked paths:
  - Movies: ${moviesPath}
  - Series: ${seriesIndexPath}`);
      sqliteDb.close();
      return true;
    }

    logger.info('Export files found, starting automatic import...');
    logger.info(`Exports directory: ${exportsPath}`);

    const options = { dryRun: false, force: false, verbose: true };
    const results: Array<{ type: string; imported: number; skipped: number; errors: number; duration: number }> = [];

    // Import movies
    if (hasMovies) {
      logger.info('--- Importing Movies ---');
      const movieImporter = createMovieImporter(drizzle, logger);
      const movieResult = await movieImporter.import(moviesPath, options);
      results.push({ type: 'Movies', ...movieResult });
    }

    // Import series
    if (hasSeries) {
      logger.info('--- Importing Series ---');
      const seriesImporter = createSeriesImporter(drizzle, logger);
      const seriesResult = await seriesImporter.import(seriesIndexPath, options);
      results.push({ type: 'Series', ...seriesResult });
    }

    // Summary
    logger.info('');
    logger.info('=== Auto-Import Summary ===');

    let totalImported = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const result of results) {
      logger.info(`${result.type}: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors (${result.duration}ms)`);
      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    }

    logger.success(`Total: ${totalImported} imported, ${totalSkipped} skipped, ${totalErrors} errors`);

    // Track import completion
    settingsRepository.set('import.lastRun', new Date().toISOString());
    logger.success('Auto-import completed successfully');

    sqliteDb.close();
    return totalErrors === 0;
  } catch (error) {
    logger.error('Auto-import failed', error as Error);
    return false;
  }
}

// Run the auto-import
performAutoImport()
  .then((success) => {
    if (success) {
      logger.success('Startup checks completed, starting server...');
      process.exit(0);
    } else {
      logger.error('Startup checks failed, but continuing to start server...');
      process.exit(0); // Exit with 0 to allow server to start anyway
    }
  })
  .catch((error) => {
    logger.error('Unexpected error during startup', error);
    process.exit(0); // Exit with 0 to allow server to start anyway
  });
