#!/usr/bin/env node
/**
 * Import Plex export data into SQLite database
 *
 * Usage:
 *   npm run import                    # Import both movies and series
 *   npm run import -- --movies-only   # Import only movies
 *   npm run import -- --series-only   # Import only series
 *   npm run import -- --dry-run       # Test run without database changes
 *   npm run import -- --force         # Overwrite existing entries
 *   npm run import -- --verbose       # Detailed logging
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { createSqliteConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrations/index.js';
import { createLogger } from './utils/logger.js';
import { createMovieImporter } from './importers/movieImporter.js';
import { createSeriesImporter } from './importers/seriesImporter.js';
import type { ImportOptions } from './importers/types.js';

// Parse command line arguments
const args = process.argv.slice(2);
const options: ImportOptions & { moviesOnly?: boolean; seriesOnly?: boolean } = {
  dryRun: args.includes('--dry-run'),
  force: args.includes('--force'),
  verbose: args.includes('--verbose'),
  moviesOnly: args.includes('--movies-only'),
  seriesOnly: args.includes('--series-only'),
};

// Determine exports path
const resolveExportsPath = (): string => {
  const candidates = [
    path.join(process.cwd(), '..', '..', 'data', 'exports'), // From apps/backend
    path.join(process.cwd(), 'data', 'exports'),             // From project root
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Could not find data/exports directory');
};

async function main() {
  const logger = createLogger({ verbose: options.verbose, prefix: '[import]' });

  try {
    logger.info('=== Plex Export Import Tool ===');

    if (options.dryRun) {
      logger.warn('DRY RUN MODE ENABLED - No database changes will be made');
    }

    if (options.force) {
      logger.warn('FORCE MODE ENABLED - Existing entries will be overwritten');
    }

    // Database setup
    const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), '..', '..', 'data', 'sqlite', 'plex-exporter.sqlite');
    logger.info(`Database: ${dbPath}`);

    const db = createSqliteConnection(dbPath);
    logger.success('Database connection established');

    // Run migrations
    if (!options.dryRun) {
      runMigrations(db);
      logger.success('Database migrations applied');
    }

    // Determine export paths
    const exportsPath = resolveExportsPath();
    logger.info(`Exports directory: ${exportsPath}`);

    const moviesPath = path.join(exportsPath, 'movies', 'movies.json');
    const seriesIndexPath = path.join(exportsPath, 'series', 'series_index.json');

    const results: Array<{ type: string; imported: number; skipped: number; errors: number; duration: number }> = [];

    // Import movies
    if (!options.seriesOnly && existsSync(moviesPath)) {
      logger.info('--- Importing Movies ---');
      const movieImporter = createMovieImporter(db, logger);
      const movieResult = await movieImporter.import(moviesPath, options);
      results.push({ type: 'Movies', ...movieResult });
    } else if (!options.seriesOnly) {
      logger.warn(`Movies file not found: ${moviesPath}`);
    }

    // Import series
    if (!options.moviesOnly && existsSync(seriesIndexPath)) {
      logger.info('--- Importing Series ---');
      const seriesImporter = createSeriesImporter(db, logger);
      const seriesResult = await seriesImporter.import(seriesIndexPath, options);
      results.push({ type: 'Series', ...seriesResult });
    } else if (!options.moviesOnly) {
      logger.warn(`Series index not found: ${seriesIndexPath}`);
    }

    // Summary
    logger.info('');
    logger.info('=== Import Summary ===');

    let totalImported = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const result of results) {
      logger.info(`${result.type}: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors (${result.duration}ms)`);
      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    }

    logger.info('');
    logger.success(`Total: ${totalImported} imported, ${totalSkipped} skipped, ${totalErrors} errors`);

    // Close database
    if (!options.dryRun) {
      db.close();
      logger.success('Database connection closed');
    }

    if (totalErrors > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Import failed', error as Error);
    process.exit(1);
  }
}

main();
