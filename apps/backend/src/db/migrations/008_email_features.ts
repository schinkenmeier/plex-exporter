import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

export const emailFeaturesMigration: Migration = {
  id: '008_email_features',
  name: 'create email features tables',
  up(db: SqliteDatabase) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_bookmarks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        media_item_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user_id ON user_bookmarks(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_bookmarks_media_item_id ON user_bookmarks(media_item_id);

      CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        media_type TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_email ON newsletter_subscriptions(email);
      CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_active ON newsletter_subscriptions(active);

      CREATE TABLE IF NOT EXISTS newsletter_digests (
        id TEXT PRIMARY KEY,
        media_type TEXT NOT NULL,
        media_item_ids TEXT NOT NULL,
        recipient_count INTEGER NOT NULL DEFAULT 0,
        sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_newsletter_digests_media_type ON newsletter_digests(media_type);
      CREATE INDEX IF NOT EXISTS idx_newsletter_digests_sent_at ON newsletter_digests(sent_at);

      CREATE TABLE IF NOT EXISTS welcome_emails (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent',
        email_id TEXT,
        sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_welcome_emails_email ON welcome_emails(email);
      CREATE INDEX IF NOT EXISTS idx_welcome_emails_status ON welcome_emails(status);
    `);
  },
};
