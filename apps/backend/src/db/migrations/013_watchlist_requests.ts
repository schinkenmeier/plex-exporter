import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

export const watchlistRequestsMigration: Migration = {
  id: '013_watchlist_requests',
  name: 'create watchlist request lifecycle tables',
  up(db: SqliteDatabase) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist_requests (
        id TEXT PRIMARY KEY,
        requester_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        items TEXT NOT NULL,
        message TEXT,
        admin_note TEXT,
        confirmation_email_id TEXT,
        admin_notification_email_id TEXT,
        last_response_email_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_watchlist_requests_status ON watchlist_requests(status);
      CREATE INDEX IF NOT EXISTS idx_watchlist_requests_requester_email ON watchlist_requests(requester_email);
      CREATE INDEX IF NOT EXISTS idx_watchlist_requests_created_at ON watchlist_requests(created_at);

      CREATE TABLE IF NOT EXISTS watchlist_request_events (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        type TEXT NOT NULL,
        actor TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        message TEXT,
        email_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES watchlist_requests(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_watchlist_request_events_request_id ON watchlist_request_events(request_id);
      CREATE INDEX IF NOT EXISTS idx_watchlist_request_events_created_at ON watchlist_request_events(created_at);
    `);
  },
};
