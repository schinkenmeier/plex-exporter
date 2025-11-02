import { Router, type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { sql } from 'drizzle-orm';
import { type AppConfig } from '../config/index.js';
import { logBuffer } from '../services/logBuffer.js';
import logger from '../services/logger.js';
import { HttpError } from '../middleware/errorHandler.js';
import type MediaRepository from '../repositories/mediaRepository.js';
import type ThumbnailRepository from '../repositories/thumbnailRepository.js';
import SettingsRepository from '../repositories/settingsRepository.js';
import SeasonRepository from '../repositories/seasonRepository.js';
import CastRepository from '../repositories/castRepository.js';
import type { MailSender } from '../services/resendService.js';
import type { TautulliClient } from '../services/tautulliService.js';
import type { DrizzleDatabase, SqliteDatabase } from '../db/index.js';
import { seasons, episodes, castMembers } from '../db/schema.js';
import type { TmdbManager } from '../services/tmdbManager.js';
import type { HeroPipelineService } from '../services/heroPipeline.js';

export interface AdminRouterOptions {
  config: AppConfig;
  mediaRepository: MediaRepository;
  thumbnailRepository: ThumbnailRepository;
  resendService: MailSender | null;
  tautulliService: TautulliClient | null;
  seasonRepository?: SeasonRepository | null;
  castRepository?: CastRepository | null;
  drizzleDatabase?: DrizzleDatabase;
  settingsRepository: SettingsRepository;
  tmdbManager: TmdbManager;
  heroPipeline: HeroPipelineService;
}

const startTime = Date.now();

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 200;
const MAX_ENUM_COLUMNS = 4;
const MAX_ENUM_SAMPLE = 12;
const MAX_ENUM_VALUE_LENGTH = 64;

interface TableSummary {
  name: string;
  rowCount: number | null;
}

interface PragmaColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

interface NormalizedColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  defaultValue: unknown;
}

interface EqualsFilterInput {
  column: string;
  value: unknown;
}

interface NullFilterInput {
  column: string;
  mode: 'null' | 'notNull';
}

interface DateRangeFilterInput {
  column: string;
  from?: string | null;
  to?: string | null;
}

interface FilterOptions {
  primaryKey: string | null;
  dateColumns: string[];
  enumValues: Record<string, Array<{ value: string; count: number }>>;
  nullableColumns: string[];
}

interface RawEqualsFilter {
  column?: unknown;
  value?: unknown;
}

interface RawNullFilter {
  column?: unknown;
  mode?: unknown;
}

interface RawDateRangeFilter {
  column?: unknown;
  from?: unknown;
  to?: unknown;
}

type IncomingFilters = {
  equals?: RawEqualsFilter[];
  nulls?: RawNullFilter[];
  dateRange?: RawDateRangeFilter;
};

const isValidIdentifier = (value: string): boolean => IDENTIFIER_PATTERN.test(value);

const isTextLikeColumn = (column: PragmaColumnInfo): boolean =>
  typeof column.type === 'string' && /char|clob|text|json/i.test(column.type);

const isLikelyDateColumn = (column: PragmaColumnInfo): boolean =>
  typeof column.type === 'string' && /(date|time)/i.test(column.type);

const isNumericColumn = (column: PragmaColumnInfo): boolean =>
  typeof column.type === 'string' && /(int|real|numeric|double|float)/i.test(column.type);

const escapeIdentifier = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

const getSqliteClient = (database: DrizzleDatabase | null | undefined): SqliteDatabase | null => {
  if (!database) {
    return null;
  }

  const candidate = database as DrizzleDatabase & { $client?: SqliteDatabase };

  return candidate.$client ?? null;
};

const normalizeRow = (row: Record<string, unknown>): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') {
      normalized[key] = value.toString();
    } else if (value instanceof Buffer) {
      normalized[key] = value.toString('base64');
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
};

const escapeLikePattern = (value: string): string =>
  value.replace(/[%_\\]/g, match => `\\${match}`);

const toCount = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);

    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
};

const collectEnumValues = (
  sqlite: SqliteDatabase,
  tableName: string,
  column: PragmaColumnInfo,
): Array<{ value: string; count: number }> => {
  try {
    const query = `
      SELECT ${escapeIdentifier(column.name)} AS value, COUNT(*) AS count
      FROM ${escapeIdentifier(tableName)}
      WHERE ${escapeIdentifier(column.name)} IS NOT NULL
        AND LENGTH(${escapeIdentifier(column.name)}) <= ?
      GROUP BY ${escapeIdentifier(column.name)}
      ORDER BY count DESC
      LIMIT ?
    `;
    const rows = sqlite
      .prepare(query)
      .all(MAX_ENUM_VALUE_LENGTH, MAX_ENUM_SAMPLE) as Array<{ value: unknown; count: unknown }>;

    return rows
      .map(entry => ({
        value: entry.value === null || entry.value === undefined ? '' : String(entry.value),
        count: toCount(entry.count),
      }))
      .filter(entry => entry.value.length > 0);
  } catch (error) {
    logger.warn('Failed to collect enum values for column', {
      table: tableName,
      column: column.name,
      error: error instanceof Error ? error.message : error,
    });
    return [];
  }
};

export const createAdminRouter = (options: AdminRouterOptions): Router => {
  const router = Router();
  const {
    config,
    mediaRepository,
    thumbnailRepository,
    resendService,
    tautulliService,
    drizzleDatabase,
    seasonRepository: suppliedSeasonRepository,
    castRepository: suppliedCastRepository,
    settingsRepository,
    tmdbManager,
    heroPipeline,
  } = options;
  const seasonRepository =
    suppliedSeasonRepository ??
    (drizzleDatabase ? new SeasonRepository(drizzleDatabase) : null);
  const castRepository =
    suppliedCastRepository ?? (drizzleDatabase ? new CastRepository(drizzleDatabase) : null);

  /**
   * GET /admin
   * Serve admin dashboard HTML
   */
  router.get('/', (_req: Request, res: Response) => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // Try production path first (dist/routes -> src/views), then development path
    const productionPath = path.join(__dirname, '..', '..', 'src', 'views', 'admin.html');
    const devPath = path.join(__dirname, '..', 'views', 'admin.html');

    const htmlPath = fs.existsSync(productionPath) ? productionPath : devPath;

    if (!fs.existsSync(htmlPath)) {
      logger.error('Admin dashboard HTML not found', { productionPath, devPath, __dirname });
      return res.status(500).send('Admin dashboard HTML not found');
    }

    res.sendFile(htmlPath);
  });

  /**
   * GET /admin/api/status
   * System status and health information
   */
  router.get('/api/status', (_req: Request, res: Response) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const memoryUsage = process.memoryUsage();

    res.json({
      status: 'ok',
      uptime: {
        seconds: uptime,
        formatted: formatUptime(uptime),
      },
      memory: {
        rss: formatBytes(memoryUsage.rss),
        heapTotal: formatBytes(memoryUsage.heapTotal),
        heapUsed: formatBytes(memoryUsage.heapUsed),
        external: formatBytes(memoryUsage.external),
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cpus: os.cpus().length,
        totalMemory: formatBytes(os.totalmem()),
        freeMemory: formatBytes(os.freemem()),
      },
      process: {
        pid: process.pid,
        cwd: process.cwd(),
      },
    });
  });

  /**
   * GET /admin/api/config
   * Current configuration (sensitive values masked)
   */
  router.get('/api/config', (_req: Request, res: Response) => {
    const maskSensitive = (value: string | null | undefined): string => {
      if (!value) return '[not set]';
      if (value.length <= 4) return '****';
      return value.substring(0, 4) + '*'.repeat(Math.min(value.length - 4, 20));
    };

    const tmdbStatus = tmdbManager.getStatus();

    res.json({
      runtime: {
        env: config.runtime.env,
      },
      server: {
        port: config.server.port,
      },
      auth: {
        enabled: !!config.auth,
        token: config.auth?.token ? maskSensitive(config.auth.token) : '[not set]',
      },
      database: {
        sqlitePath: config.database.sqlitePath,
        exists: fs.existsSync(config.database.sqlitePath),
      },
      hero: {
        policyPath: config.hero?.policyPath || '[not set]',
        policyExists: config.hero?.policyPath ? fs.existsSync(config.hero.policyPath) : false,
      },
      tautulli: {
        enabled: !!config.tautulli,
        url: config.tautulli?.url || '[not set]',
        apiKey: config.tautulli?.apiKey ? maskSensitive(config.tautulli.apiKey) : '[not set]',
      },
      tmdb: {
        enabled: tmdbStatus.hasToken,
        accessToken: tmdbStatus.hasToken ? tmdbStatus.tokenPreview ?? 'set' : null,
        source: tmdbStatus.source,
        updatedAt: tmdbStatus.updatedAt,
        fromEnv: tmdbStatus.fromEnv,
        fromDatabase: tmdbStatus.fromDatabase,
      },
      resend: {
        enabled: !!config.resend,
        apiKey: config.resend?.apiKey ? maskSensitive(config.resend.apiKey) : '[not set]',
        fromEmail: config.resend?.fromEmail || '[not set]',
      },
    });
  });

  router.get('/api/tmdb', (_req: Request, res: Response) => {
    const status = tmdbManager.getStatus();
    res.json({
      enabled: status.hasToken,
      source: status.source,
      tokenPreview: status.tokenPreview,
      updatedAt: status.updatedAt,
      fromEnv: status.fromEnv,
      fromDatabase: status.fromDatabase,
    });
  });

  router.post('/api/tmdb', (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
      if (!rawToken) {
        throw new HttpError(400, 'TMDb access token must not be empty.');
      }
      const record = settingsRepository.set('tmdb.accessToken', rawToken);
      const service = tmdbManager.setDatabaseToken(record.value, { updatedAt: record.updatedAt });
      heroPipeline.setTmdbService(service);
      const status = tmdbManager.getStatus();
      res.json({
        success: true,
        status: {
          enabled: status.hasToken,
          source: status.source,
          tokenPreview: status.tokenPreview,
          updatedAt: status.updatedAt,
          fromEnv: status.fromEnv,
          fromDatabase: status.fromDatabase,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/api/tmdb', (_req: Request, res: Response) => {
    settingsRepository.delete('tmdb.accessToken');
    const service = tmdbManager.setDatabaseToken(null);
    heroPipeline.setTmdbService(service);
    const status = tmdbManager.getStatus();
    res.json({
      success: true,
      status: {
        enabled: status.hasToken,
        source: status.source,
        tokenPreview: status.tokenPreview,
        updatedAt: status.updatedAt,
        fromEnv: status.fromEnv,
        fromDatabase: status.fromDatabase,
      },
    });
  });

  router.post('/api/test/tmdb', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = typeof req.body?.token === 'string' ? req.body.token : undefined;
      const result = await tmdbManager.testToken(token);
      res.json(result);
    } catch (error) {
      const status = (error as { status?: number } | undefined)?.status ?? 500;
      next(
        new HttpError(status, error instanceof Error ? error.message : 'TMDb token test failed', {
          cause: error instanceof Error ? error : undefined,
        }),
      );
    }
  });

  /**
   * GET /admin/api/stats
   * Database statistics
   */
  router.get('/api/stats', (_req: Request, res: Response) => {
    try {
      const allMedia = mediaRepository.listAll();
      const movies = allMedia.filter(m => m.mediaType === 'movie');
      const series = allMedia.filter(m => m.mediaType === 'tv');

      // Get thumbnail counts
      const movieIds = movies.map(m => m.id);
      const seriesIds = series.map(m => m.id);
      const movieThumbnails = thumbnailRepository.listByMediaIds(movieIds);
      const seriesThumbnails = thumbnailRepository.listByMediaIds(seriesIds);

      let totalMovieThumbnails = 0;
      let totalSeriesThumbnails = 0;

      for (const thumbnails of movieThumbnails.values()) {
        totalMovieThumbnails += thumbnails.length;
      }

      for (const thumbnails of seriesThumbnails.values()) {
        totalSeriesThumbnails += thumbnails.length;
      }

      const structure = {
        seasons: null as number | null,
        episodes: null as number | null,
        castMembers: null as number | null,
      };

      if (drizzleDatabase) {
        try {
          const [{ value: seasonCount } = { value: 0 }] = drizzleDatabase
            .select({ value: sql<number>`count(*)` })
            .from(seasons)
            .all();
          const [{ value: episodeCount } = { value: 0 }] = drizzleDatabase
            .select({ value: sql<number>`count(*)` })
            .from(episodes)
            .all();
          const [{ value: castCount } = { value: 0 }] = drizzleDatabase
            .select({ value: sql<number>`count(*)` })
            .from(castMembers)
            .all();

          structure.seasons = seasonCount ?? 0;
          structure.episodes = episodeCount ?? 0;
          structure.castMembers = castCount ?? 0;
        } catch (error) {
          logger.warn('Failed to compute series structure counts', {
            error: error instanceof Error ? error.message : error,
          });
        }
      }

      let seriesSamples: Array<Record<string, unknown>> = [];

      if (seasonRepository && castRepository && series.length > 0) {
        seriesSamples = series.slice(0, 3).map((entry) => {
          const seasonsWithEpisodes = seasonRepository.listByMediaIdWithEpisodes(entry.id);
          const cast = castRepository.listByMediaId(entry.id).slice(0, 5);
          const totalEpisodes = seasonsWithEpisodes.reduce(
            (sum, season) => sum + season.episodes.length,
            0,
          );
          return {
            title: entry.title,
            ratingKey: entry.plexId,
            seasonCount: seasonsWithEpisodes.length,
            episodeCount: totalEpisodes,
            seasons: seasonsWithEpisodes.map((season) => ({
              number: season.seasonNumber,
              title: season.title,
              episodeCount: season.episodes.length,
            })),
            cast: cast.map((appearance) => ({
              name: appearance.name,
              character: appearance.character,
              order: appearance.order,
            })),
          };
        });
      }

      res.json({
        media: {
          total: allMedia.length,
          movies: movies.length,
          series: series.length,
          seasons: structure.seasons,
          episodes: structure.episodes,
        },
        cast: {
          members: structure.castMembers,
        },
        thumbnails: {
          total: totalMovieThumbnails + totalSeriesThumbnails,
          movies: totalMovieThumbnails,
          series: totalSeriesThumbnails,
        },
        database: {
          path: config.database.sqlitePath,
          size: formatBytes(getFileSize(config.database.sqlitePath)),
        },
        seriesSamples,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get database stats', { error: message });
      return res.status(500).json({ error: 'Failed to get database stats', details: message });
    }
  });
  router.get('/api/db/tables', (_req: Request, res: Response) => {
    if (!drizzleDatabase) {
      return res.status(503).json({
        error: 'Database explorer is unavailable without an active SQLite connection.',
      });
    }

    try {
      const sqlite = getSqliteClient(drizzleDatabase);

      if (!sqlite) {
        throw new Error('SQLite client handle is not available');
      }

      const rawTables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>;

      const tables: TableSummary[] = rawTables.map(({ name }) => {
        try {
          const countRow = sqlite
            .prepare(`SELECT COUNT(*) as count FROM ${escapeIdentifier(name)}`)
            .get() as { count: unknown } | undefined;
          const rowCount = countRow ? toCount(countRow.count) : 0;
          return { name, rowCount };
        } catch (error) {
          logger.warn('Failed to compute row count for table', {
            table: name,
            error: error instanceof Error ? error.message : error,
          });
          return { name, rowCount: null };
        }
      });

      res.json({ tables });
    } catch (error) {
      logger.error('Failed to list database tables', {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Failed to list database tables' });
    }
  });

  router.post('/api/db/query', (req: Request, res: Response) => {
    if (!drizzleDatabase) {
      return res.status(503).json({
        error: 'Database explorer is unavailable without an active SQLite connection.',
      });
    }

    try {
      const sqlite = getSqliteClient(drizzleDatabase);

      if (!sqlite) {
        throw new Error('SQLite client handle is not available');
      }

      const tableNameRaw = typeof req.body?.table === 'string' ? req.body.table.trim() : '';

      if (!tableNameRaw || !isValidIdentifier(tableNameRaw)) {
        return res.status(400).json({ error: 'Invalid table name supplied.' });
      }

      const limitParsed = Number.parseInt(String(req.body?.limit ?? ''), 10);
      const limit = Number.isNaN(limitParsed)
        ? DEFAULT_QUERY_LIMIT
        : Math.min(Math.max(limitParsed, 1), MAX_QUERY_LIMIT);

      const offsetParsed = Number.parseInt(String(req.body?.offset ?? ''), 10);
      const offset = Number.isNaN(offsetParsed) ? 0 : Math.max(offsetParsed, 0);

      const directionRaw = typeof req.body?.direction === 'string' ? req.body.direction : 'asc';
      const direction = directionRaw.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

      const pragmaColumns = sqlite
        .prepare(`PRAGMA table_info(${escapeIdentifier(tableNameRaw)})`)
        .all() as PragmaColumnInfo[];

      if (pragmaColumns.length === 0) {
        return res.status(404).json({ error: 'Table not found.' });
      }

      const normalizedColumns: NormalizedColumnInfo[] = pragmaColumns.map(column => ({
        name: column.name,
        type: column.type ?? '',
        notNull: column.notnull === 1,
        primaryKey: column.pk > 0,
        defaultValue: column.dflt_value ?? null,
      }));
      const normalizedColumnMap = new Map(normalizedColumns.map(column => [column.name, column]));
      const availableColumns = normalizedColumns.map(column => column.name);

      const orderByRaw =
        typeof req.body?.orderBy === 'string' ? req.body.orderBy.trim() : undefined;

      if (orderByRaw && !availableColumns.includes(orderByRaw)) {
        return res.status(400).json({ error: 'Invalid order column supplied.' });
      }

      const filtersRaw: IncomingFilters =
        typeof req.body?.filters === 'object' && req.body.filters !== null
          ? (req.body.filters as IncomingFilters)
          : {};

      const rawEqualsFilters: RawEqualsFilter[] = Array.isArray(filtersRaw.equals)
        ? filtersRaw.equals
        : [];
      const equalsFilters: EqualsFilterInput[] = rawEqualsFilters
        .filter((entry): entry is { column: string; value: unknown } => {
          if (!entry || typeof entry !== 'object') return false;
          if (typeof entry.column !== 'string') return false;
          if (!availableColumns.includes(entry.column)) return false;
          const { value } = entry;
          return (
            value !== undefined &&
            value !== null &&
            (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
          );
        })
        .map(entry => ({
          column: entry.column,
          value:
            typeof entry.value === 'boolean'
              ? entry.value
                ? 1
                : 0
              : entry.value,
        }));

      const rawNullFilters: RawNullFilter[] = Array.isArray(filtersRaw.nulls)
        ? filtersRaw.nulls
        : [];
      const nullFilters: NullFilterInput[] = rawNullFilters
        .filter((entry): entry is { column: string; mode: 'null' | 'notNull' } => {
          if (!entry || typeof entry !== 'object') return false;
          if (typeof entry.column !== 'string') return false;
          if (!availableColumns.includes(entry.column)) return false;
          return entry.mode === 'null' || entry.mode === 'notNull';
        })
        .map(entry => ({ column: entry.column, mode: entry.mode }));

      const dateColumns = pragmaColumns.filter(isLikelyDateColumn).map(column => column.name);
      let dateRangeFilter: DateRangeFilterInput | null = null;

      if (filtersRaw.dateRange && typeof filtersRaw.dateRange === 'object') {
        const candidateColumn =
          typeof filtersRaw.dateRange.column === 'string' ? filtersRaw.dateRange.column : null;
        const fromRaw =
          typeof filtersRaw.dateRange.from === 'string' ? filtersRaw.dateRange.from : undefined;
        const toRaw =
          typeof filtersRaw.dateRange.to === 'string' ? filtersRaw.dateRange.to : undefined;
        if (candidateColumn && dateColumns.includes(candidateColumn)) {
          dateRangeFilter = {
            column: candidateColumn,
            from: fromRaw && fromRaw.length > 0 ? fromRaw : undefined,
            to: toRaw && toRaw.length > 0 ? toRaw : undefined,
          };
        }
      }

      const selectedColumnsRaw: unknown[] = Array.isArray(req.body?.columns)
        ? (req.body.columns as unknown[])
        : [];
      const selectedColumnsSanitized = Array.from(
        new Set(
          selectedColumnsRaw
            .filter((column): column is string => typeof column === 'string')
            .map(column => column.trim())
            .filter(column => isValidIdentifier(column) && availableColumns.includes(column)),
        ),
      );

      const resolvedSelectedColumns: string[] =
        selectedColumnsSanitized.length > 0 ? selectedColumnsSanitized : [...availableColumns];

      const textColumnNames: string[] = pragmaColumns
        .filter(isTextLikeColumn)
        .map(column => column.name);
      const intersectsSelectedText = resolvedSelectedColumns.some(column =>
        textColumnNames.includes(column),
      );
      const searchableColumns = intersectsSelectedText
        ? resolvedSelectedColumns.filter(column => textColumnNames.includes(column))
        : textColumnNames;
      const searchColumns = Array.from(new Set<string>(searchableColumns));

      const searchTerm = typeof req.body?.search === 'string' ? req.body.search.trim() : '';

      const primaryKeyCandidates = pragmaColumns.filter(column => column.pk > 0);
      const primaryKeyInfo =
        primaryKeyCandidates.find(column => isNumericColumn(column)) ?? primaryKeyCandidates[0] ?? null;
      const primaryKeyColumnName = primaryKeyInfo?.name ?? null;

      let primaryKeyValue: string | number | null = null;
      if (primaryKeyColumnName && req.body?.primaryKeyValue !== undefined) {
        const rawValue = String(req.body.primaryKeyValue ?? '').trim();
        if (rawValue.length > 0) {
          if (primaryKeyInfo && isNumericColumn(primaryKeyInfo)) {
            const numericValue = Number(rawValue);
            if (Number.isNaN(numericValue)) {
              return res.status(400).json({ error: 'Invalid numeric primary key value supplied.' });
            }
            primaryKeyValue = numericValue;
          } else {
            primaryKeyValue = rawValue;
          }
        }
      }

      let orderByColumn = orderByRaw ?? null;
      if (!orderByColumn && primaryKeyValue !== null && primaryKeyColumnName) {
        orderByColumn = primaryKeyColumnName;
      }

      const whereClauses: string[] = [];
      const params: Array<string | number> = [];

      if (searchTerm && searchColumns.length > 0) {
        const likeValue = `%${escapeLikePattern(searchTerm)}%`;
        whereClauses.push(
          `(${searchColumns
            .map(column => `${escapeIdentifier(column)} LIKE ? ESCAPE '\\\\'`)
            .join(' OR ')})`,
        );
        for (let index = 0; index < searchColumns.length; index += 1) {
          params.push(likeValue);
        }
      }

      for (const filter of equalsFilters) {
        whereClauses.push(`${escapeIdentifier(filter.column)} = ?`);
        params.push(typeof filter.value === 'number' ? filter.value : String(filter.value));
      }

      for (const filter of nullFilters) {
        if (filter.mode === 'null') {
          whereClauses.push(`${escapeIdentifier(filter.column)} IS NULL`);
        } else {
          whereClauses.push(`${escapeIdentifier(filter.column)} IS NOT NULL`);
        }
      }

      if (dateRangeFilter) {
        const columnIdentifier = escapeIdentifier(dateRangeFilter.column);
        if (dateRangeFilter.from && dateRangeFilter.from.length > 0) {
          whereClauses.push(`${columnIdentifier} >= ?`);
          params.push(dateRangeFilter.from);
        }
        if (dateRangeFilter.to && dateRangeFilter.to.length > 0) {
          whereClauses.push(`${columnIdentifier} <= ?`);
          params.push(dateRangeFilter.to);
        }
      }

      if (primaryKeyValue !== null && primaryKeyColumnName) {
        const comparator = direction === 'DESC' ? '<=' : '>=';
        whereClauses.push(`${escapeIdentifier(primaryKeyColumnName)} ${comparator} ?`);
        params.push(primaryKeyValue);
      }

      const whereClause = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
      const orderClause = orderByColumn
        ? ` ORDER BY ${escapeIdentifier(orderByColumn)} ${direction}`
        : '';
      const selectClause = resolvedSelectedColumns.map(column => escapeIdentifier(column)).join(', ');

      const querySql = `SELECT ${selectClause} FROM ${escapeIdentifier(tableNameRaw)}${whereClause}${orderClause} LIMIT ? OFFSET ?`;
      const queryParams = [...params, limit, offset];
      const rowsRaw = sqlite
        .prepare(querySql)
        .all(...queryParams) as Array<Record<string, unknown>>;
      const rows = rowsRaw.map(normalizeRow);

      const totalRow = sqlite
        .prepare(
          `SELECT COUNT(*) as count FROM ${escapeIdentifier(tableNameRaw)}${whereClause}`,
        )
        .get(...params) as { count: unknown } | undefined;
      const total = totalRow ? toCount(totalRow.count) : 0;

      const nullableColumns = normalizedColumns
        .filter(column => !column.notNull)
        .map(column => column.name);

      const enumValues: Record<string, Array<{ value: string; count: number }>> = {};
      const enumCandidates = pragmaColumns.filter(isTextLikeColumn).slice(0, MAX_ENUM_COLUMNS);
      for (const candidate of enumCandidates) {
        const values = collectEnumValues(sqlite, tableNameRaw, candidate);
        if (values.length > 0) {
          enumValues[candidate.name] = values;
        }
      }

      const filterOptions: FilterOptions = {
        primaryKey: primaryKeyColumnName,
        dateColumns,
        enumValues,
        nullableColumns,
      };

      const resolvedColumnsMetadata = resolvedSelectedColumns
        .map(column => normalizedColumnMap.get(column) ?? null)
        .filter((column): column is NormalizedColumnInfo => column !== null);

      res.json({
        table: tableNameRaw,
        columns: resolvedColumnsMetadata,
        schema: normalizedColumns,
        rows,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + rows.length < total,
        },
        search: searchTerm || null,
        orderBy: orderByColumn ?? null,
        direction,
        searchableColumns: searchColumns,
        filterOptions,
        appliedFilters: {
          equals: equalsFilters.map(filter => ({
            column: filter.column,
            value: typeof filter.value === 'number' ? filter.value : String(filter.value),
          })),
          dateRange: dateRangeFilter,
          nulls: nullFilters,
          primaryKeyValue: primaryKeyValue !== null ? String(primaryKeyValue) : null,
        },
        selectedColumns: resolvedSelectedColumns,
      });
    } catch (error) {
      logger.error('Failed to execute database explorer query', {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Failed to execute query.' });
    }
  });

  /**
   * GET /admin/api/logs
   * Get system logs
   */
  router.get('/api/logs', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const level = req.query.level as string;
    const since = req.query.since as string;

    let logs = logBuffer.getAll();

    // Filter by level
    if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
      logs = logs.filter(log => log.level === level);
    }

    // Filter by timestamp
    if (since) {
      logs = logs.filter(log => log.timestamp >= since);
    }

    // Limit results
    logs = logs.slice(-limit);

    res.json({
      logs,
      stats: logBuffer.getStats(),
    });
  });

  /**
   * DELETE /admin/api/logs
   * Clear system logs
   */
  router.delete('/api/logs', (_req: Request, res: Response) => {
    logBuffer.clear();
    res.json({ success: true, message: 'System logs cleared' });
  });

  /**
   * POST /admin/api/test/tautulli
   * Test Tautulli connection
   */
  router.post('/api/test/tautulli', async (_req: Request, res: Response, next: NextFunction) => {
    if (!tautulliService) {
      return res.status(503).json({
        success: false,
        error: 'Tautulli service is not configured',
        message: 'Please configure Tautulli environment variables (TAUTULLI_URL, TAUTULLI_API_KEY)',
      });
    }

    try {
      const libraries = await tautulliService.getLibraries();

      res.json({
        success: true,
        message: 'Successfully connected to Tautulli',
        libraries: libraries.length,
        data: libraries,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Tautulli test failed', { error: message });
      res.status(502).json({ success: false, error: 'Tautulli test failed', details: message });
    }
  });

  /**
   * POST /admin/api/test/database
   * Test database connection
   */
  router.post('/api/test/database', (_req: Request, res: Response) => {
    try {
      const allMedia = mediaRepository.listAll();

      res.json({
        success: true,
        message: 'Database connection successful',
        recordCount: allMedia.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Database test failed', { error: message });
      res.status(500).json({ success: false, error: 'Database test failed', details: message });
    }
  });

  /**
   * POST /admin/api/test/resend
   * Test Resend email connection
   */
  router.post('/api/test/resend', async (req: Request, res: Response, next: NextFunction) => {
    if (!resendService) {
      return res.status(503).json({
        success: false,
        error: 'Resend service is not configured',
        message: 'Please configure Resend environment variables (RESEND_API_KEY, RESEND_FROM_EMAIL) or set them in the admin panel',
      });
    }

    const { to } = req.body || {};
    if (!to) {
      return next(new HttpError(400, 'Recipient email address (to) is required'));
    }

    try {
      const result = await resendService.sendMail({
        to,
        subject: 'Plex Exporter Admin - Resend Test',
        text: 'This is a test email from the Plex Exporter Admin Panel using Resend.',
        html: '<h1>Resend Test</h1><p>This is a test email from the Plex Exporter Admin Panel using <strong>Resend</strong>.</p>',
      });

      res.json({
        success: true,
        message: 'Test email sent successfully',
        id: result.id,
        from: result.from,
        to: result.to,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Resend test failed', { error: message });
      res.status(502).json({ success: false, error: 'Resend test failed', details: message });
    }
  });

  /**
   * GET /admin/api/resend/settings
   * Get current Resend settings from database
   */
  router.get('/api/resend/settings', (_req: Request, res: Response) => {
    try {
      const apiKey = settingsRepository.get('resend.apiKey');
      const fromEmail = settingsRepository.get('resend.fromEmail');

      const hasDbConfig = !!apiKey?.value && !!fromEmail?.value;
      const hasEnvConfig = !!(config.resend?.apiKey && config.resend?.fromEmail);

      res.json({
        success: true,
        enabled: hasDbConfig || hasEnvConfig,
        fromDatabase: hasDbConfig,
        fromEnv: hasEnvConfig && !hasDbConfig,
        source: hasEnvConfig && !hasDbConfig ? 'environment' : 'database',
        apiKeyPreview: apiKey?.value ? maskSensitive(apiKey.value) : null,
        fromEmail: fromEmail?.value || null,
        updatedAt: apiKey?.updatedAt || fromEmail?.updatedAt || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get Resend settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to get Resend settings', details: message });
    }
  });

  /**
   * PUT /admin/api/resend/settings
   * Update Resend settings in database
   */
  router.put('/api/resend/settings', (req: Request, res: Response, next: NextFunction) => {
    const { apiKey, fromEmail } = req.body || {};

    if (!apiKey || !fromEmail) {
      return next(new HttpError(400, 'Both apiKey and fromEmail are required'));
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fromEmail)) {
      return next(new HttpError(400, 'Invalid email format for fromEmail'));
    }

    try {
      settingsRepository.set('resend.apiKey', apiKey);
      settingsRepository.set('resend.fromEmail', fromEmail);

      logger.info('Resend settings updated', { fromEmail });

      res.json({
        success: true,
        message: 'Resend settings updated successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update Resend settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to update Resend settings', details: message });
    }
  });

  /**
   * DELETE /admin/api/resend/settings
   * Clear Resend settings from database
   */
  router.delete('/api/resend/settings', (_req: Request, res: Response) => {
    try {
      settingsRepository.delete('resend.apiKey');
      settingsRepository.delete('resend.fromEmail');

      logger.info('Resend settings cleared');

      res.json({
        success: true,
        message: 'Resend settings cleared successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to clear Resend settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to clear Resend settings', details: message });
    }
  });

  /**
   * GET /admin/api/tautulli/settings
   * Get Tautulli settings from database
   */
  router.get('/api/tautulli/settings', (_req: Request, res: Response) => {
    try {
      const url = settingsRepository.get('tautulli.url');
      const apiKey = settingsRepository.get('tautulli.apiKey');

      res.json({
        success: true,
        settings: {
          url: url?.value || null,
          apiKey: apiKey?.value || null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get Tautulli settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to get Tautulli settings', details: message });
    }
  });

  /**
   * PUT /admin/api/tautulli/settings
   * Update Tautulli settings in database
   */
  router.put('/api/tautulli/settings', (req: Request, res: Response, next: NextFunction) => {
    const { url, apiKey } = req.body || {};

    if (!url || !apiKey) {
      return next(new HttpError(400, 'Both url and apiKey are required'));
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return next(new HttpError(400, 'Invalid URL format for Tautulli URL'));
    }

    try {
      settingsRepository.set('tautulli.url', url);
      settingsRepository.set('tautulli.apiKey', apiKey);

      logger.info('Tautulli settings updated', { url });

      res.json({
        success: true,
        message: 'Tautulli settings updated successfully. Restart required to apply changes.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update Tautulli settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to update Tautulli settings', details: message });
    }
  });

  /**
   * DELETE /admin/api/tautulli/settings
   * Clear Tautulli settings from database
   */
  router.delete('/api/tautulli/settings', (_req: Request, res: Response) => {
    try {
      settingsRepository.delete('tautulli.url');
      settingsRepository.delete('tautulli.apiKey');

      logger.info('Tautulli settings cleared');

      res.json({
        success: true,
        message: 'Tautulli settings cleared successfully. Restart required to apply changes.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to clear Tautulli settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to clear Tautulli settings', details: message });
    }
  });

  return router;
};

// Helper functions

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function getFileSize(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

function maskSensitive(value: string): string {
  if (value.length <= 8) {
    return '****';
  }
  const visibleChars = 4;
  const start = value.substring(0, visibleChars);
  const end = value.substring(value.length - visibleChars);
  return `${start}${'*'.repeat(value.length - visibleChars * 2)}${end}`;
}

export default createAdminRouter;
