import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

export const newsletterCampaignsMigration: Migration = {
  id: '014_newsletter_campaigns',
  name: 'create newsletter campaign tables',
  up(db: SqliteDatabase) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS newsletter_campaigns (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        media_type TEXT,
        media_item_ids TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'draft',
        recipient_count INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        last_error_message TEXT,
        sent_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_status ON newsletter_campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_created_at ON newsletter_campaigns(created_at);
      CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_media_type ON newsletter_campaigns(media_type);

      CREATE TABLE IF NOT EXISTS newsletter_campaign_recipients (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        subscription_id TEXT,
        email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        email_id TEXT,
        error_message TEXT,
        sent_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (subscription_id) REFERENCES newsletter_subscriptions(id) ON DELETE SET NULL,
        UNIQUE (campaign_id, email)
      );

      CREATE INDEX IF NOT EXISTS idx_newsletter_campaign_recipients_campaign_id ON newsletter_campaign_recipients(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_newsletter_campaign_recipients_status ON newsletter_campaign_recipients(status);
      CREATE INDEX IF NOT EXISTS idx_newsletter_campaign_recipients_email ON newsletter_campaign_recipients(email);
    `);
  },
};
