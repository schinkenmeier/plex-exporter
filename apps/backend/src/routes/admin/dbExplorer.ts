import { Router, type Request, type Response } from 'express';
import type { DrizzleDatabase, SqliteDatabase } from '../../db/index.js';
import logger from '../../services/logger.js';

export interface AdminDbExplorerRouterOptions {
  drizzleDatabase?: DrizzleDatabase;
}

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

export const createAdminDbExplorerRouter = ({
  drizzleDatabase,
}: AdminDbExplorerRouterOptions): Router => {
  const router = Router();

  router.get('/tables', (_req: Request, res: Response) => {
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

  router.post('/query', (req: Request, res: Response) => {
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
            .map(column => `${escapeIdentifier(column)} LIKE ? ESCAPE '\\'`)
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

  return router;
};
