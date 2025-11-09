type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const ADMIN_API_BASE = '/admin/api';

export interface AdminSystemStatus {
  status: 'ok' | 'error' | string;
  uptime: { seconds: number; formatted: string };
  memory: { rss: string; heapTotal: string; heapUsed: string; external?: string };
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    cpus: number;
    totalMemory: string;
    freeMemory: string;
  };
  process: { pid: number; cwd: string };
}

export interface SeriesSampleSeason {
  number: number;
  title?: string;
  episodeCount: number;
}

export interface SeriesSampleCast {
  name?: string;
  character?: string;
  order?: number;
}

export interface SeriesSample {
  id?: string;
  title: string;
  seasonCount?: number;
  episodeCount?: number;
  seasons: SeriesSampleSeason[];
  cast: SeriesSampleCast[];
}

export interface AdminStatsResponse {
  media: {
    total: number;
    movies: number;
    series: number;
    seasons: number | null;
    episodes: number | null;
  };
  cast: {
    members: number | null;
  };
  thumbnails: {
    total: number;
    movies: number;
    series: number;
  };
  database: {
    path: string;
    size: string;
  };
  seriesSamples: SeriesSample[];
}

export interface AdminConfigSnapshot {
  runtime: { env: string };
  server: { port: number };
  auth: { enabled: boolean; token: string };
  database: { sqlitePath: string; exists: boolean };
  hero: { policyPath: string; policyExists: boolean };
  tautulli: { enabled: boolean; url: string; apiKey: string };
  tmdb: {
    enabled: boolean;
    accessToken: string | null;
    source: string;
    updatedAt: number | null;
    fromEnv: boolean;
    fromDatabase: boolean;
  };
  resend: {
    enabled: boolean;
    apiKey: string;
    fromEmail: string;
  };
}

export interface TableSummary {
  name: string;
  rowCount: number | null;
}

export interface DatabaseTablesResponse {
  tables: TableSummary[];
}

export interface DatabaseFilterEquals {
  column: string;
  value: string | number | boolean;
}

export interface DatabaseFilterNull {
  column: string;
  mode: 'null' | 'notNull';
}

export interface DatabaseFilterDateRange {
  column: string;
  from?: string;
  to?: string;
}

export interface DatabaseQueryRequest {
  table: string;
  limit?: number;
  offset?: number;
  orderBy?: string | null;
  direction?: 'ASC' | 'DESC';
  columns?: string[];
  filters?: {
    equals?: DatabaseFilterEquals[];
    nulls?: DatabaseFilterNull[];
    dateRange?: DatabaseFilterDateRange | null;
  };
  search?: string;
  primaryKeyValue?: string | number | null;
}

export interface DatabaseColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  defaultValue: unknown;
}

export interface DatabaseQueryResponse {
  table: string;
  columns: DatabaseColumnInfo[];
  schema: DatabaseColumnInfo[];
  rows: Record<string, unknown>[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  search: string | null;
  orderBy: string | null;
  direction: 'ASC' | 'DESC';
  searchableColumns: string[];
  filterOptions: {
    primaryKey: string | null;
    dateColumns: string[];
    enumValues: Record<string, Array<{ value: string; count: number }>>;
    nullableColumns: string[];
  };
  appliedFilters: {
    equals: Array<{ column: string; value: string | number }>;
    dateRange: DatabaseFilterDateRange | null;
    nulls: DatabaseFilterNull[];
    primaryKeyValue: string | null;
  };
  selectedColumns: string[];
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface LogsResponse {
  logs: LogEntry[];
  stats: {
    total: number;
    byLevel: Record<LogLevel, number>;
    maxSize: number;
  };
}

export interface TmdbStatus {
  enabled: boolean;
  source: string;
  tokenPreview: string | null;
  updatedAt: number | null;
  fromEnv: boolean;
  fromDatabase: boolean;
}

export interface TmdbSaveResponse {
  success: boolean;
  status: TmdbStatus;
}

export interface TmdbTestResult {
  success: true;
  status: number;
  message: string;
  tokenPreview: string;
  rateLimitRemaining: number | null;
}

export interface ResendSettingsResponse {
  success: boolean;
  enabled: boolean;
  fromDatabase: boolean;
  fromEnv: boolean;
  source: 'database' | 'environment';
  apiKeyPreview: string | null;
  fromEmail: string | null;
  updatedAt: number | null;
}

export interface WatchlistAdminEmailResponse {
  success: boolean;
  adminEmail: string | null;
  updatedAt: number | null;
}

export interface TautulliConfigStatus {
  configured: boolean;
  tautulliUrl?: string;
  hasApiKey?: boolean;
}

export interface TautulliLibrary {
  sectionId: number;
  sectionName: string;
  friendlyName?: string;
  sectionType: string;
}

export interface LibrarySection {
  id?: string;
  sectionId: number;
  sectionName: string;
  sectionType: 'movie' | 'show';
  enabled: boolean;
}

export interface LibrarySectionsResponse {
  sections: LibrarySection[];
}

export interface SnapshotSettingsResponse {
  maxSnapshots: number;
  storedLimit: number | null;
  defaults: {
    min: number;
    max: number;
    fallback: number;
  };
}

export interface SyncSchedule {
  id: string;
  jobType: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt?: string | null;
}

export interface SyncSchedulesResponse {
  schedules: SyncSchedule[];
}

export interface ManualSyncOptions {
  incremental: boolean;
  enrichWithTmdb: boolean;
  syncCovers: boolean;
}

export interface TestResponse {
  success: boolean;
  message: string;
  [key: string]: unknown;
}

export interface WelcomeEmailStats {
  total: number;
  sent: number;
  failed: number;
  successRate: string;
}

export interface WelcomeEmailHistoryEntry {
  id: string;
  email: string;
  recipientName?: string | null;
  toolUrl?: string | null;
  status: 'sent' | 'failed';
  sentAt?: string | null;
  errorMessage?: string | null;
}

export class AdminApiClient {
  constructor(private readonly baseUrl: string = ADMIN_API_BASE) {}

  private async request<T>(
    path: string,
    method: HttpMethod,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`, window.location.origin);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        url.searchParams.set(key, String(value));
      });
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as T) : (null as T);

    if (!response.ok) {
      const message = (data as { message?: string } | null)?.message ?? response.statusText;
      throw new Error(message || 'Request failed');
    }

    return data;
  }

  getSystemStatus(): Promise<AdminSystemStatus> {
    return this.request<AdminSystemStatus>('/status', 'GET');
  }

  getStats(): Promise<AdminStatsResponse> {
    return this.request<AdminStatsResponse>('/stats', 'GET');
  }

  getConfigSnapshot(): Promise<AdminConfigSnapshot> {
    return this.request<AdminConfigSnapshot>('/config', 'GET');
  }

  getDatabaseTables(): Promise<DatabaseTablesResponse> {
    return this.request<DatabaseTablesResponse>('/db/tables', 'GET');
  }

  queryDatabase(payload: DatabaseQueryRequest): Promise<DatabaseQueryResponse> {
    return this.request<DatabaseQueryResponse>('/db/query', 'POST', payload);
  }

  getLogs(params: { limit?: number; level?: LogLevel; since?: string } = {}): Promise<LogsResponse> {
    return this.request<LogsResponse>(
      '/logs',
      'GET',
      undefined,
      {
        limit: params.limit,
        level: params.level,
        since: params.since,
      },
    );
  }

  clearLogs(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/logs', 'DELETE');
  }

  getTmdbStatus(): Promise<TmdbStatus> {
    return this.request<TmdbStatus>('/tmdb', 'GET');
  }

  saveTmdbToken(token: string): Promise<TmdbSaveResponse> {
    return this.request<TmdbSaveResponse>('/tmdb', 'POST', { token });
  }

  deleteTmdbToken(): Promise<TmdbSaveResponse> {
    return this.request<TmdbSaveResponse>('/tmdb', 'DELETE');
  }

  testTmdbToken(token?: string): Promise<TmdbTestResult> {
    return this.request<TmdbTestResult>('/test/tmdb', 'POST', token ? { token } : undefined);
  }

  getResendSettings(): Promise<ResendSettingsResponse> {
    return this.request<ResendSettingsResponse>('/resend/settings', 'GET');
  }

  saveResendSettings(payload: { apiKey: string; fromEmail: string }): Promise<TestResponse> {
    return this.request<TestResponse>('/resend/settings', 'PUT', payload);
  }

  clearResendSettings(): Promise<TestResponse> {
    return this.request<TestResponse>('/resend/settings', 'DELETE');
  }

  testResend(to: string): Promise<TestResponse> {
    return this.request<TestResponse>('/test/resend', 'POST', { to });
  }

  getWatchlistAdminEmail(): Promise<WatchlistAdminEmailResponse> {
    return this.request<WatchlistAdminEmailResponse>('/watchlist/admin-email', 'GET');
  }

  saveWatchlistAdminEmail(adminEmail: string): Promise<TestResponse> {
    return this.request<TestResponse>('/watchlist/admin-email', 'PUT', { adminEmail });
  }

  clearWatchlistAdminEmail(): Promise<TestResponse> {
    return this.request<TestResponse>('/watchlist/admin-email', 'DELETE');
  }

  testTautulli(): Promise<TestResponse> {
    return this.request<TestResponse>('/test/tautulli', 'POST');
  }

  testDatabase(): Promise<TestResponse> {
    return this.request<TestResponse>('/test/database', 'POST');
  }

  getTautulliConfig(): Promise<TautulliConfigStatus> {
    return this.request<TautulliConfigStatus>('/tautulli/config', 'GET');
  }

  saveTautulliConfig(payload: { tautulliUrl: string; apiKey: string }): Promise<TestResponse> {
    return this.request<TestResponse>('/tautulli/config', 'POST', payload);
  }

  testTautulliConfig(payload?: { tautulliUrl: string; apiKey: string }): Promise<TestResponse> {
    return this.request<TestResponse>('/tautulli/config/test', 'POST', payload);
  }

  getTautulliLibraries(): Promise<{ libraries: TautulliLibrary[] }> {
    return this.request('/tautulli/libraries', 'GET');
  }

  getLibrarySections(): Promise<LibrarySectionsResponse> {
    return this.request('/tautulli/library-sections', 'GET');
  }

  saveLibrarySections(sections: LibrarySection[]): Promise<TestResponse> {
    return this.request('/tautulli/library-sections', 'POST', { sections });
  }

  startManualSync(options: ManualSyncOptions): Promise<{ message: string; options: ManualSyncOptions }> {
    return this.request('/tautulli/sync/manual', 'POST', options);
  }

  getSyncSchedules(): Promise<SyncSchedulesResponse> {
    return this.request('/tautulli/sync/schedules', 'GET');
  }

  saveSyncSchedule(payload: { jobType: string; cronExpression: string; enabled: boolean }): Promise<TestResponse> {
    return this.request('/tautulli/sync/schedules', 'POST', payload);
  }

  getSnapshotSettings(): Promise<SnapshotSettingsResponse> {
    return this.request('/tautulli/snapshots/settings', 'GET');
  }

  saveSnapshotSettings(maxSnapshots: number): Promise<{ success: boolean; maxSnapshots: number }> {
    return this.request('/tautulli/snapshots/settings', 'POST', { maxSnapshots });
  }
}

export const adminApiClient = new AdminApiClient();

class WelcomeEmailApiClient {
  constructor(private readonly baseUrl: string = '/api/welcome-email') {}

  private async request<T>(
    path: string,
    method: HttpMethod,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`, window.location.origin);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        url.searchParams.set(key, String(value));
      });
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as T) : (null as T);

    if (!response.ok) {
      const message = (data as { message?: string; error?: string } | null)?.message ??
        (data as { error?: string } | null)?.error ??
        response.statusText;
      throw new Error(message || 'Request failed');
    }

    return data;
  }

  getStats(): Promise<WelcomeEmailStats> {
    return this.request<{ success: boolean; data: WelcomeEmailStats }>('/stats', 'GET').then(res => res.data);
  }

  getHistory(limit = 25): Promise<WelcomeEmailHistoryEntry[]> {
    return this.request<{ success: boolean; data: WelcomeEmailHistoryEntry[] }>('/history', 'GET', undefined, { limit })
      .then(res => res.data);
  }

  checkRecipient(email: string): Promise<{ success: boolean; hasReceived: boolean }> {
    const encoded = encodeURIComponent(email);
    return this.request<{ success: boolean; hasReceived: boolean }>(`/check/${encoded}`, 'GET');
  }

  send(payload: { email: string; recipientName?: string; toolUrl?: string }): Promise<{ success: boolean; message: string }> {
    return this.request('/',
      'POST',
      payload,
    ) as Promise<{ success: boolean; message: string }>;
  }

  deleteEntry(id: string): Promise<{ success: boolean; deleted: number }> {
    return this.request(`/history/${id}`, 'DELETE') as Promise<{ success: boolean; deleted: number }>;
  }

  deleteByRecipient(email: string): Promise<{ success: boolean; deleted: number }> {
    const encoded = encodeURIComponent(email);
    return this.request(`/recipient/${encoded}`, 'DELETE') as Promise<{ success: boolean; deleted: number }>;
  }

  clearHistory(): Promise<{ success: boolean; deleted: number }> {
    return this.request('/history', 'DELETE') as Promise<{ success: boolean; deleted: number }>;
  }
}

export const welcomeEmailApiClient = new WelcomeEmailApiClient();
