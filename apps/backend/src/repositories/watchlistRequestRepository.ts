import { randomUUID } from 'node:crypto';
import { desc, eq, notInArray, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/index.js';
import { watchlistRequestEvents, watchlistRequests } from '../db/schema.js';
import type { WatchlistItem } from '../services/watchlistEmailService.js';

export const WATCHLIST_REQUEST_STATUSES = ['new', 'in_progress', 'parked', 'done', 'rejected'] as const;
export type WatchlistRequestStatus = typeof WATCHLIST_REQUEST_STATUSES[number];
const TERMINAL_WATCHLIST_REQUEST_STATUSES: WatchlistRequestStatus[] = ['done', 'rejected'];

export interface WatchlistRequestRecord {
  id: string;
  requesterEmail: string;
  status: WatchlistRequestStatus;
  items: WatchlistItem[];
  message: string | null;
  adminNote: string | null;
  confirmationEmailId: string | null;
  adminNotificationEmailId: string | null;
  lastResponseEmailId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface WatchlistRequestEventRecord {
  id: string;
  requestId: string;
  type: 'created' | 'status_changed' | 'reply_sent' | 'note_updated';
  actor: 'system' | 'admin';
  fromStatus: WatchlistRequestStatus | null;
  toStatus: WatchlistRequestStatus | null;
  message: string | null;
  emailId: string | null;
  createdAt: string;
}

export interface WatchlistRequestListOptions {
  status?: WatchlistRequestStatus | null;
  limit?: number;
  offset?: number;
}

export interface WatchlistRequestSummary {
  counts: Record<WatchlistRequestStatus | 'total', number>;
  requesterCount: number;
  oldestOpenRequestAt: string | null;
}

const isTerminalStatus = (status: WatchlistRequestStatus): boolean =>
  TERMINAL_WATCHLIST_REQUEST_STATUSES.includes(status);

const mapRequestRow = (row: typeof watchlistRequests.$inferSelect): WatchlistRequestRecord => ({
  id: row.id,
  requesterEmail: row.requesterEmail,
  status: row.status,
  items: row.items,
  message: row.message ?? null,
  adminNote: row.adminNote ?? null,
  confirmationEmailId: row.confirmationEmailId ?? null,
  adminNotificationEmailId: row.adminNotificationEmailId ?? null,
  lastResponseEmailId: row.lastResponseEmailId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  resolvedAt: row.resolvedAt ?? null,
});

const mapEventRow = (row: typeof watchlistRequestEvents.$inferSelect): WatchlistRequestEventRecord => ({
  id: row.id,
  requestId: row.requestId,
  type: row.type,
  actor: row.actor,
  fromStatus: row.fromStatus ?? null,
  toStatus: row.toStatus ?? null,
  message: row.message ?? null,
  emailId: row.emailId ?? null,
  createdAt: row.createdAt,
});

export class WatchlistRequestRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  create(input: {
    requesterEmail: string;
    items: WatchlistItem[];
    message?: string | null;
  }): WatchlistRequestRecord {
    const id = randomUUID();
    const inserted = this.db
      .insert(watchlistRequests)
      .values({
        id,
        requesterEmail: input.requesterEmail,
        status: 'new',
        items: input.items,
        message: input.message ?? null,
      })
      .returning()
      .all();

    const row = inserted[0];
    if (!row) {
      throw new Error('Failed to create watchlist request.');
    }

    this.addEvent({
      requestId: id,
      type: 'created',
      actor: 'system',
      toStatus: 'new',
    });

    return mapRequestRow(row);
  }

  list(options: WatchlistRequestListOptions = {}): WatchlistRequestRecord[] {
    const limit = options.limit && options.limit > 0 ? Math.min(Math.floor(options.limit), 100) : 50;
    const offset = options.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const condition = options.status ? eq(watchlistRequests.status, options.status) : undefined;
    const baseSelect = this.db.select().from(watchlistRequests);
    const filtered = condition ? baseSelect.where(condition) : baseSelect;

    return filtered
      .orderBy(desc(watchlistRequests.createdAt))
      .limit(limit)
      .offset(offset)
      .all()
      .map(mapRequestRow);
  }

  count(options: Pick<WatchlistRequestListOptions, 'status'> = {}): number {
    const condition = options.status ? eq(watchlistRequests.status, options.status) : undefined;
    const baseSelect = this.db.select({ count: sql<number>`count(*)` }).from(watchlistRequests);
    const result = condition ? baseSelect.where(condition).get() : baseSelect.get();
    return Number(result?.count ?? 0);
  }

  getSummary(): WatchlistRequestSummary {
    const counts = WATCHLIST_REQUEST_STATUSES.reduce(
      (acc, status) => ({ ...acc, [status]: 0 }),
      { total: 0 } as Record<WatchlistRequestStatus | 'total', number>,
    );

    const statusRows = this.db
      .select({
        status: watchlistRequests.status,
        count: sql<number>`count(*)`,
      })
      .from(watchlistRequests)
      .groupBy(watchlistRequests.status)
      .all();

    for (const row of statusRows) {
      const count = Number(row.count);
      counts[row.status] = count;
      counts.total += count;
    }

    const requesterRow = this.db
      .select({
        count: sql<number>`count(DISTINCT ${watchlistRequests.requesterEmail})`,
      })
      .from(watchlistRequests)
      .get();

    const oldestOpenRow = this.db
      .select({
        oldestOpenRequestAt: sql<string | null>`min(${watchlistRequests.createdAt})`,
      })
      .from(watchlistRequests)
      .where(notInArray(watchlistRequests.status, TERMINAL_WATCHLIST_REQUEST_STATUSES))
      .get();

    return {
      counts,
      requesterCount: Number(requesterRow?.count ?? 0),
      oldestOpenRequestAt: oldestOpenRow?.oldestOpenRequestAt ?? null,
    };
  }

  getById(id: string): WatchlistRequestRecord | null {
    const row = this.db
      .select()
      .from(watchlistRequests)
      .where(eq(watchlistRequests.id, id))
      .limit(1)
      .get();
    return row ? mapRequestRow(row) : null;
  }

  listEvents(requestId: string): WatchlistRequestEventRecord[] {
    return this.db
      .select()
      .from(watchlistRequestEvents)
      .where(eq(watchlistRequestEvents.requestId, requestId))
      .orderBy(desc(watchlistRequestEvents.createdAt))
      .all()
      .map(mapEventRow);
  }

  setEmailIds(
    id: string,
    input: {
      confirmationEmailId?: string | null;
      adminNotificationEmailId?: string | null;
      lastResponseEmailId?: string | null;
    },
  ): WatchlistRequestRecord | null {
    const changes: Partial<typeof watchlistRequests.$inferInsert> = {};
    if ('confirmationEmailId' in input) changes.confirmationEmailId = input.confirmationEmailId ?? null;
    if ('adminNotificationEmailId' in input) changes.adminNotificationEmailId = input.adminNotificationEmailId ?? null;
    if ('lastResponseEmailId' in input) changes.lastResponseEmailId = input.lastResponseEmailId ?? null;
    if (Object.keys(changes).length === 0) return this.getById(id);

    this.db
      .update(watchlistRequests)
      .set({ ...changes, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(watchlistRequests.id, id))
      .run();

    return this.getById(id);
  }

  updateStatus(
    id: string,
    status: WatchlistRequestStatus,
    message?: string | null,
  ): WatchlistRequestRecord | null {
    const existing = this.getById(id);
    if (!existing) return null;
    if (existing.status === status) return existing;

    this.db
      .update(watchlistRequests)
      .set({
        status,
        updatedAt: sql`CURRENT_TIMESTAMP`,
        resolvedAt: isTerminalStatus(status) ? sql`CURRENT_TIMESTAMP` : null,
      })
      .where(eq(watchlistRequests.id, id))
      .run();

    this.addEvent({
      requestId: id,
      type: 'status_changed',
      actor: 'admin',
      fromStatus: existing.status,
      toStatus: status,
      message: message ?? null,
    });

    return this.getById(id);
  }

  updateAdminNote(id: string, adminNote: string | null): WatchlistRequestRecord | null {
    const existing = this.getById(id);
    if (!existing) return null;

    this.db
      .update(watchlistRequests)
      .set({
        adminNote,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(watchlistRequests.id, id))
      .run();

    this.addEvent({
      requestId: id,
      type: 'note_updated',
      actor: 'admin',
      message: adminNote,
    });

    return this.getById(id);
  }

  recordReply(input: {
    requestId: string;
    message: string;
    emailId: string;
    status?: WatchlistRequestStatus | null;
  }): WatchlistRequestRecord | null {
    const existing = this.getById(input.requestId);
    if (!existing) return null;

    const nextStatus = input.status ?? existing.status;
    this.db
      .update(watchlistRequests)
      .set({
        status: nextStatus,
        lastResponseEmailId: input.emailId,
        updatedAt: sql`CURRENT_TIMESTAMP`,
        resolvedAt: isTerminalStatus(nextStatus) ? sql`CURRENT_TIMESTAMP` : null,
      })
      .where(eq(watchlistRequests.id, input.requestId))
      .run();

    this.addEvent({
      requestId: input.requestId,
      type: 'reply_sent',
      actor: 'admin',
      fromStatus: existing.status === nextStatus ? null : existing.status,
      toStatus: existing.status === nextStatus ? null : nextStatus,
      message: input.message,
      emailId: input.emailId,
    });

    return this.getById(input.requestId);
  }

  private addEvent(input: {
    requestId: string;
    type: WatchlistRequestEventRecord['type'];
    actor: WatchlistRequestEventRecord['actor'];
    fromStatus?: WatchlistRequestStatus | null;
    toStatus?: WatchlistRequestStatus | null;
    message?: string | null;
    emailId?: string | null;
  }): WatchlistRequestEventRecord {
    const row = this.db
      .insert(watchlistRequestEvents)
      .values({
        id: randomUUID(),
        requestId: input.requestId,
        type: input.type,
        actor: input.actor,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        message: input.message ?? null,
        emailId: input.emailId ?? null,
      })
      .returning()
      .get();

    return mapEventRow(row);
  }
}

export const isWatchlistRequestStatus = (value: unknown): value is WatchlistRequestStatus =>
  typeof value === 'string' && WATCHLIST_REQUEST_STATUSES.includes(value as WatchlistRequestStatus);

export default WatchlistRequestRepository;
