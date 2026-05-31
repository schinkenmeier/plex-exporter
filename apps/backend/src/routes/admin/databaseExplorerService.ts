import type { DrizzleDatabase, SqliteDatabase } from '../../db/index.js';
import { HttpError } from '../../middleware/errorHandler.js';
import logger from '../../services/logger.js';
import {
  classifyDatabaseExplorerColumn,
  databaseExplorerTablePolicies,
  getDatabaseExplorerTablePolicy,
  type DatabaseExplorerSensitivity,
  type DatabaseExplorerTablePolicy,
} from './databaseExplorerPolicy.js';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 200;
const MAX_ENUM_VALUES = 25;
const MAX_ENUM_VALUE_LENGTH = 64;
const MAX_TEXT_LENGTH = 120;

interface PragmaColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

export interface DatabaseExplorerColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: unknown;
  sensitivity: DatabaseExplorerSensitivity;
  capabilities: {
    selectable: boolean;
    sortable: boolean;
    searchable: boolean;
    filterable: boolean;
    rangeFilterable: boolean;
    enumSafe: boolean;
  };
}

export interface DatabaseExplorerTable {
  name: string;
  label: string;
  category: string;
  description: string;
  rowCount: number | null;
}

export interface DatabaseExplorerCellMeta {
  sensitivity: DatabaseExplorerSensitivity;
  masked: boolean;
  truncated: boolean;
  type: 'null' | 'string' | 'number' | 'boolean' | 'json' | 'blob';
}

export interface DatabaseExplorerQueryRequest {
  columns?: unknown;
  pagination?: unknown;
  sort?: unknown;
  search?: unknown;
  filters?: unknown;
}

interface NormalizedQuery {
  columns: string[];
  limit: number;
  offset: number;
  sort: { column: string; direction: 'asc' | 'desc' } | null;
  search: { term: string; columns: string[] } | null;
  filters: Array<
    | { type: 'equals'; column: string; value: string | number | boolean | null }
    | { type: 'null'; column: string; value: boolean }
    | { type: 'range'; column: string; from?: string | number; to?: string | number }
  >;
}

export interface DatabaseExplorerQueryResult {
  data: {
    table: string;
    columns: DatabaseExplorerColumn[];
    rows: Array<{
      values: Record<string, unknown>;
      cells: Record<string, DatabaseExplorerCellMeta>;
    }>;
  };
  page: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  applied: {
    columns: string[];
    sort: NormalizedQuery['sort'];
    search: NormalizedQuery['search'];
    filters: NormalizedQuery['filters'];
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const escapeIdentifier = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

const escapeLikePattern = (value: string): string =>
  value.replace(/[%_\\]/g, match => `\\${match}`);

const toCount = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

export const getSqliteClient = (
  database: DrizzleDatabase | null | undefined,
): SqliteDatabase | null => {
  if (!database) return null;
  const candidate = database as DrizzleDatabase & { $client?: SqliteDatabase };
  return candidate.$client ?? null;
};

const requireValidResourceName = (tableName: string): void => {
  if (!IDENTIFIER_PATTERN.test(tableName)) {
    throw new HttpError(404, 'Database table not found.');
  }
};

const normalizeScalar = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Buffer) return value.toString('base64');
  return value;
};

const getCellType = (value: unknown): DatabaseExplorerCellMeta['type'] => {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Buffer) return 'blob';
  if (typeof value === 'number' || typeof value === 'bigint') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'json';
  return 'string';
};

const maskEmail = (value: string): string => {
  const [localPart, domain] = value.split('@');
  if (!localPart || !domain) return '[redacted]';
  const prefix = localPart.slice(0, Math.min(2, localPart.length));
  return `${prefix}${'*'.repeat(Math.max(3, localPart.length - prefix.length))}@${domain}`;
};

const redactJsonKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactJsonKeys);
  }

  if (!isRecord(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/(api[-_]?key|token|authorization|password|secret|email)/i.test(key)) {
      result[key] = '[redacted]';
    } else {
      result[key] = redactJsonKeys(entry);
    }
  }
  return result;
};

const maskCellValue = (
  value: unknown,
  column: DatabaseExplorerColumn,
): { value: unknown; masked: boolean; truncated: boolean } => {
  const normalized = normalizeScalar(value);

  if (column.sensitivity === 'secret') {
    return { value: '[redacted]', masked: true, truncated: false };
  }

  if (normalized === null || normalized === undefined) {
    return { value: null, masked: false, truncated: false };
  }

  if (column.sensitivity === 'pii') {
    const text = String(normalized);
    return {
      value: text.includes('@') ? maskEmail(text) : '[redacted]',
      masked: true,
      truncated: false,
    };
  }

  if (column.sensitivity === 'internal_id') {
    const text = String(normalized);
    if (text.length <= MAX_TEXT_LENGTH) {
      return { value: text, masked: false, truncated: false };
    }
    return { value: `${text.slice(0, MAX_TEXT_LENGTH)}...`, masked: false, truncated: true };
  }

  if (column.sensitivity === 'private_text') {
    const text = String(normalized);
    return {
      value: text.length > MAX_TEXT_LENGTH ? `[redacted text, ${text.length} chars]` : '[redacted text]',
      masked: true,
      truncated: text.length > MAX_TEXT_LENGTH,
    };
  }

  if (typeof normalized === 'string' && normalized.length > MAX_TEXT_LENGTH) {
    try {
      const parsed = JSON.parse(normalized);
      const redacted = JSON.stringify(redactJsonKeys(parsed));
      return {
        value: redacted.length > MAX_TEXT_LENGTH ? `${redacted.slice(0, MAX_TEXT_LENGTH)}...` : redacted,
        masked: redacted !== normalized,
        truncated: redacted.length > MAX_TEXT_LENGTH,
      };
    } catch {
      return { value: `${normalized.slice(0, MAX_TEXT_LENGTH)}...`, masked: false, truncated: true };
    }
  }

  return { value: normalized, masked: false, truncated: false };
};

export class DatabaseExplorerService {
  constructor(private readonly sqlite: SqliteDatabase) {}

  listTables(): DatabaseExplorerTable[] {
    return [...databaseExplorerTablePolicies.values()]
      .filter(policy => this.tableExists(policy.name))
      .map(policy => ({
        name: policy.name,
        label: policy.label,
        category: policy.category,
        description: policy.description,
        rowCount: this.countRows(policy.name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getSchema(tableName: string): {
    table: DatabaseExplorerTable;
    columns: DatabaseExplorerColumn[];
    primaryKey: string[];
  } {
    const { policy, columns } = this.resolveTable(tableName);
    return {
      table: {
        name: policy.name,
        label: policy.label,
        category: policy.category,
        description: policy.description,
        rowCount: this.countRows(policy.name),
      },
      columns,
      primaryKey: columns.filter(column => column.primaryKey).map(column => column.name),
    };
  }

  queryRows(tableName: string, request: DatabaseExplorerQueryRequest): DatabaseExplorerQueryResult {
    const { policy, columns } = this.resolveTable(tableName);
    const normalized = this.normalizeQuery(policy, columns, request);
    const selectedColumns = normalized.columns
      .map(columnName => columns.find(column => column.name === columnName))
      .filter((column): column is DatabaseExplorerColumn => Boolean(column));

    const params: Array<string | number | boolean | null> = [];
    const whereClauses: string[] = [];

    if (normalized.search) {
      const likeValue = `%${escapeLikePattern(normalized.search.term)}%`;
      whereClauses.push(
        `(${normalized.search.columns
          .map(column => `${escapeIdentifier(column)} LIKE ? ESCAPE '\\'`)
          .join(' OR ')})`,
      );
      normalized.search.columns.forEach(() => params.push(likeValue));
    }

    for (const filter of normalized.filters) {
      const column = escapeIdentifier(filter.column);
      if (filter.type === 'equals') {
        if (filter.value === null) {
          whereClauses.push(`${column} IS NULL`);
        } else {
          whereClauses.push(`${column} = ?`);
          params.push(typeof filter.value === 'boolean' ? (filter.value ? 1 : 0) : filter.value);
        }
      } else if (filter.type === 'null') {
        whereClauses.push(`${column} IS ${filter.value ? '' : 'NOT '}NULL`);
      } else {
        if (filter.from !== undefined) {
          whereClauses.push(`${column} >= ?`);
          params.push(filter.from);
        }
        if (filter.to !== undefined) {
          whereClauses.push(`${column} <= ?`);
          params.push(filter.to);
        }
      }
    }

    const whereClause = whereClauses.length ? ` WHERE ${whereClauses.join(' AND ')}` : '';
    const orderClause = normalized.sort
      ? ` ORDER BY ${escapeIdentifier(normalized.sort.column)} ${normalized.sort.direction.toUpperCase()}`
      : '';
    const selectClause = normalized.columns.map(escapeIdentifier).join(', ');
    const querySql = `SELECT ${selectClause} FROM ${escapeIdentifier(policy.name)}${whereClause}${orderClause} LIMIT ? OFFSET ?`;
    const rowsRaw = this.sqlite
      .prepare(querySql)
      .all(...params, normalized.limit, normalized.offset) as Array<Record<string, unknown>>;
    const totalRow = this.sqlite
      .prepare(`SELECT COUNT(*) AS count FROM ${escapeIdentifier(policy.name)}${whereClause}`)
      .get(...params) as { count: unknown } | undefined;
    const total = totalRow ? toCount(totalRow.count) : 0;

    return {
      data: {
        table: policy.name,
        columns: selectedColumns,
        rows: rowsRaw.map(row => {
          const values: Record<string, unknown> = {};
          const cells: Record<string, DatabaseExplorerCellMeta> = {};
          for (const column of selectedColumns) {
            const rawValue = row[column.name];
            const masked = maskCellValue(rawValue, column);
            values[column.name] = masked.value;
            cells[column.name] = {
              sensitivity: column.sensitivity,
              masked: masked.masked,
              truncated: masked.truncated,
              type: getCellType(rawValue),
            };
          }
          return { values, cells };
        }),
      },
      page: {
        limit: normalized.limit,
        offset: normalized.offset,
        total,
        hasMore: normalized.offset + rowsRaw.length < total,
      },
      applied: {
        columns: normalized.columns,
        sort: normalized.sort,
        search: normalized.search,
        filters: normalized.filters,
      },
    };
  }

  getFilterOptions(tableName: string): {
    table: string;
    filters: Record<string, Array<{ value: string | number | boolean | null; count: number }>>;
  } {
    const { policy, columns } = this.resolveTable(tableName);
    const filters: Record<string, Array<{ value: string | number | boolean | null; count: number }>> = {};

    for (const column of columns.filter(entry => entry.capabilities.enumSafe)) {
      try {
        const rows = this.sqlite
          .prepare(
            `
              SELECT ${escapeIdentifier(column.name)} AS value, COUNT(*) AS count
              FROM ${escapeIdentifier(policy.name)}
              WHERE ${escapeIdentifier(column.name)} IS NOT NULL
                AND LENGTH(${escapeIdentifier(column.name)}) <= ?
              GROUP BY ${escapeIdentifier(column.name)}
              ORDER BY count DESC
              LIMIT ?
            `,
          )
          .all(MAX_ENUM_VALUE_LENGTH, MAX_ENUM_VALUES) as Array<{ value: unknown; count: unknown }>;
        filters[column.name] = rows.map(row => ({
          value: normalizeScalar(row.value) as string | number | boolean | null,
          count: toCount(row.count),
        }));
      } catch (error) {
        logger.warn('Failed to collect database explorer filter options', {
          table: policy.name,
          column: column.name,
          error: error instanceof Error ? error.message : error,
        });
        filters[column.name] = [];
      }
    }

    return { table: policy.name, filters };
  }

  private resolveTable(tableName: string): {
    policy: DatabaseExplorerTablePolicy;
    columns: DatabaseExplorerColumn[];
  } {
    requireValidResourceName(tableName);
    const policy = getDatabaseExplorerTablePolicy(tableName);
    if (!policy || !this.tableExists(tableName)) {
      throw new HttpError(404, 'Database table not found.');
    }

    const pragmaColumns = this.sqlite
      .prepare(`PRAGMA table_info(${escapeIdentifier(tableName)})`)
      .all() as PragmaColumnInfo[];

    if (!pragmaColumns.length) {
      throw new HttpError(404, 'Database table not found.');
    }

    return {
      policy,
      columns: pragmaColumns.map(column => {
        const policyForColumn = classifyDatabaseExplorerColumn(policy, column.name);
        return {
          name: column.name,
          type: column.type ?? '',
          nullable: column.notnull !== 1,
          primaryKey: column.pk > 0,
          defaultValue: normalizeScalar(column.dflt_value ?? null),
          sensitivity: policyForColumn.sensitivity,
          capabilities: {
            selectable: policyForColumn.selectable,
            sortable: policyForColumn.sortable,
            searchable: policyForColumn.searchable,
            filterable: policyForColumn.filterable,
            rangeFilterable: policyForColumn.rangeFilterable,
            enumSafe: policyForColumn.enumSafe,
          },
        };
      }),
    };
  }

  private normalizeQuery(
    policy: DatabaseExplorerTablePolicy,
    columns: DatabaseExplorerColumn[],
    request: DatabaseExplorerQueryRequest,
  ): NormalizedQuery {
    const columnMap = new Map(columns.map(column => [column.name, column]));
    const selectableColumns = columns.filter(column => column.capabilities.selectable);
    const rawColumns = Array.isArray(request.columns) ? request.columns : [];
    const requestedColumns = rawColumns.length
      ? [...new Set(rawColumns.filter((column): column is string => typeof column === 'string'))]
      : policy.defaultColumns.filter(column => columnMap.get(column)?.capabilities.selectable);

    if (!requestedColumns.length) {
      throw new HttpError(400, 'At least one selectable column is required.');
    }

    for (const columnName of requestedColumns) {
      const column = columnMap.get(columnName);
      if (!column || !column.capabilities.selectable) {
        throw new HttpError(400, 'Unsupported database column requested.', {
          details: { column: columnName },
        });
      }
    }

    const pagination = isRecord(request.pagination) ? request.pagination : {};
    const limitRaw = Number.parseInt(String(pagination.limit ?? DEFAULT_QUERY_LIMIT), 10);
    const offsetRaw = Number.parseInt(String(pagination.offset ?? 0), 10);
    const limit = Number.isNaN(limitRaw) ? DEFAULT_QUERY_LIMIT : Math.min(Math.max(limitRaw, 1), MAX_QUERY_LIMIT);
    const offset = Number.isNaN(offsetRaw) ? 0 : Math.max(offsetRaw, 0);

    const sort = (() => {
      if (!isRecord(request.sort)) return null;
      const columnName = typeof request.sort.column === 'string' ? request.sort.column : '';
      const column = columnMap.get(columnName);
      if (!column || !column.capabilities.sortable) {
        throw new HttpError(400, 'Unsupported sort column requested.', {
          details: { column: columnName },
        });
      }
      return {
        column: columnName,
        direction: request.sort.direction === 'desc' ? 'desc' as const : 'asc' as const,
      };
    })();

    const search = (() => {
      if (!isRecord(request.search)) return null;
      const term = typeof request.search.term === 'string' ? request.search.term.trim() : '';
      if (!term) return null;
      const rawSearchColumns = Array.isArray(request.search.columns) ? request.search.columns : [];
      const searchColumns = rawSearchColumns.length
        ? [...new Set(rawSearchColumns.filter((column): column is string => typeof column === 'string'))]
        : selectableColumns.filter(column => column.capabilities.searchable).map(column => column.name);

      if (!searchColumns.length) {
        throw new HttpError(400, 'No searchable columns are available for this table.');
      }

      for (const columnName of searchColumns) {
        const column = columnMap.get(columnName);
        if (!column || !column.capabilities.searchable) {
          throw new HttpError(400, 'Unsupported search column requested.', {
            details: { column: columnName },
          });
        }
      }

      return { term, columns: searchColumns };
    })();

    const filters = this.normalizeFilters(columnMap, request.filters);

    return { columns: requestedColumns, limit, offset, sort, search, filters };
  }

  private normalizeFilters(
    columnMap: Map<string, DatabaseExplorerColumn>,
    rawFilters: unknown,
  ): NormalizedQuery['filters'] {
    if (!Array.isArray(rawFilters)) return [];

    return rawFilters.map((filter): NormalizedQuery['filters'][number] => {
      if (!isRecord(filter)) {
        throw new HttpError(400, 'Invalid database filter supplied.');
      }

      const columnName = typeof filter.column === 'string' ? filter.column : '';
      const column = columnMap.get(columnName);
      const type = filter.type;

      if (type === 'range') {
        if (!column || !column.capabilities.rangeFilterable) {
          throw new HttpError(400, 'Unsupported range filter column requested.', {
            details: { column: columnName },
          });
        }
        const from = typeof filter.from === 'string' || typeof filter.from === 'number' ? filter.from : undefined;
        const to = typeof filter.to === 'string' || typeof filter.to === 'number' ? filter.to : undefined;
        if (from === undefined && to === undefined) {
          throw new HttpError(400, 'Range filter requires from or to.');
        }
        return { type: 'range', column: columnName, from, to };
      }

      if (!column || !column.capabilities.filterable) {
        throw new HttpError(400, 'Unsupported filter column requested.', {
          details: { column: columnName },
        });
      }

      if (type === 'equals') {
        const value = filter.value;
        if (
          value !== null &&
          typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean'
        ) {
          throw new HttpError(400, 'Equals filter value must be scalar or null.');
        }
        return { type: 'equals', column: columnName, value };
      }

      if (type === 'null') {
        if (typeof filter.value !== 'boolean') {
          throw new HttpError(400, 'Null filter value must be boolean.');
        }
        return { type: 'null', column: columnName, value: filter.value };
      }

      throw new HttpError(400, 'Unsupported database filter type supplied.');
    });
  }

  private tableExists(tableName: string): boolean {
    const row = this.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) as { name: string } | undefined;
    return Boolean(row);
  }

  private countRows(tableName: string): number | null {
    try {
      const row = this.sqlite
        .prepare(`SELECT COUNT(*) AS count FROM ${escapeIdentifier(tableName)}`)
        .get() as { count: unknown } | undefined;
      return row ? toCount(row.count) : 0;
    } catch (error) {
      logger.warn('Failed to count database explorer table rows', {
        table: tableName,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }
}
