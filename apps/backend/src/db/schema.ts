import { randomUUID } from 'node:crypto';
import { integer, sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

const userRoles = ['admin', 'viewer'] as const;
const mediaTypes = ['movie', 'tv'] as const;
const importStatuses = ['pending', 'running', 'completed', 'failed'] as const;
const emailStatuses = ['draft', 'scheduled', 'sent', 'failed'] as const;
const scheduleFrequencies = ['hourly', 'daily', 'weekly', 'monthly'] as const;
const jobTypes = ['tautulli_sync', 'cover_update'] as const;
const sectionTypes = ['movie', 'show'] as const;

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  role: text('role', { enum: userRoles }).notNull().default('viewer'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const mediaItems = sqliteTable('media_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tautulliId: text('tautulli_id').notNull().unique(),
  type: text('type', { enum: mediaTypes }).notNull(),
  title: text('title').notNull(),
  sortTitle: text('sort_title'),
  librarySectionId: integer('library_section_id'),
  year: integer('year'),
  rating: real('rating'),
  contentRating: text('content_rating'),
  summary: text('summary'),
  tagline: text('tagline'),
  duration: integer('duration'),
  poster: text('poster'),
  backdrop: text('backdrop'),
  studio: text('studio'),
  genres: text('genres', { mode: 'json' }).$type<string[] | null>(),
  directors: text('directors', { mode: 'json' }).$type<string[] | null>(),
  writers: text('writers', { mode: 'json' }).$type<string[] | null>(),
  countries: text('countries', { mode: 'json' }).$type<string[] | null>(),
  collections: text('collections', { mode: 'json' }).$type<string[] | null>(),
  audienceRating: real('audience_rating'),
  addedAt: text('added_at'),
  originallyAvailableAt: text('originally_available_at'),
  guid: text('guid'),
  plexUpdatedAt: text('plex_updated_at'),
  plexAddedAt: text('plex_added_at'),
  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  tmdbId: integer('tmdb_id'),
  tmdbRating: integer('tmdb_rating'),
  tmdbVoteCount: integer('tmdb_vote_count'),
  tmdbEnriched: integer('tmdb_enriched', { mode: 'boolean' })
    .notNull()
    .default(false),
  imdbId: text('imdb_id'),
});

export const insertMediaItemSchema = createInsertSchema(mediaItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMediaItem = z.infer<typeof insertMediaItemSchema>;
export type MediaItem = typeof mediaItems.$inferSelect;

export const seasons = sqliteTable('seasons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mediaItemId: integer('media_item_id')
    .notNull()
    .references(() => mediaItems.id, { onDelete: 'cascade' }),
  tautulliId: text('tautulli_id').notNull().unique(),
  seasonNumber: integer('season_number').notNull(),
  title: text('title'),
  summary: text('summary'),
  poster: text('poster'),
  episodeCount: integer('episode_count'),
});

export const insertSeasonSchema = createInsertSchema(seasons).omit({
  id: true,
});
export type InsertSeason = z.infer<typeof insertSeasonSchema>;
export type Season = typeof seasons.$inferSelect;

export const episodes = sqliteTable('episodes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  seasonId: integer('season_id')
    .notNull()
    .references(() => seasons.id, { onDelete: 'cascade' }),
  tautulliId: text('tautulli_id').notNull().unique(),
  episodeNumber: integer('episode_number').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  duration: integer('duration'),
  rating: text('rating'),
  airDate: text('air_date'),
  thumb: text('thumb'),
});

export const insertEpisodeSchema = createInsertSchema(episodes).omit({
  id: true,
});
export type InsertEpisode = z.infer<typeof insertEpisodeSchema>;
export type Episode = typeof episodes.$inferSelect;

export const castMembers = sqliteTable('cast_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  role: text('role'),
  photo: text('photo'),
});

export const insertCastMemberSchema = createInsertSchema(castMembers).omit({
  id: true,
});
export type InsertCastMember = z.infer<typeof insertCastMemberSchema>;
export type CastMember = typeof castMembers.$inferSelect;

export const mediaCast = sqliteTable('media_cast', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mediaItemId: integer('media_item_id')
    .notNull()
    .references(() => mediaItems.id, { onDelete: 'cascade' }),
  castMemberId: integer('cast_member_id')
    .notNull()
    .references(() => castMembers.id, { onDelete: 'cascade' }),
  character: text('character'),
  order: integer('order'),
});

export const insertMediaCastSchema = createInsertSchema(mediaCast).omit({
  id: true,
});
export type InsertMediaCast = z.infer<typeof insertMediaCastSchema>;
export type MediaCast = typeof mediaCast.$inferSelect;

export const mediaThumbnails = sqliteTable('media_thumbnails', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mediaItemId: integer('media_item_id')
    .notNull()
    .references(() => mediaItems.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const tautulliSnapshots = sqliteTable('tautulli_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  capturedAt: text('captured_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  payload: text('payload').notNull(),
});

export const heroPools = sqliteTable('hero_pools', {
  kind: text('kind').primaryKey(),
  policyHash: text('policy_hash').notNull(),
  payload: text('payload').notNull(),
  history: text('history').notNull(),
  expiresAt: integer('expires_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const integrationSettings = sqliteTable('integration_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const importJobs = sqliteTable('import_jobs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  status: text('status', { enum: importStatuses }).notNull().default('pending'),
  itemsProcessed: integer('items_processed').notNull().default(0),
  totalItems: integer('total_items').notNull().default(0),
  errorMessage: text('error_message'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const insertImportJobSchema = createInsertSchema(importJobs).omit({
  id: true,
  createdAt: true,
});
export type InsertImportJob = z.infer<typeof insertImportJobSchema>;
export type ImportJob = typeof importJobs.$inferSelect;

export const emailCampaigns = sqliteTable('email_campaigns', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  subject: text('subject').notNull(),
  template: text('template').notNull(),
  recipientEmails: text('recipient_emails', { mode: 'json' })
    .$type<string[]>()
    .notNull(),
  status: text('status', { enum: emailStatuses }).notNull().default('draft'),
  scheduledFor: text('scheduled_for'),
  sentAt: text('sent_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const insertEmailCampaignSchema = createInsertSchema(emailCampaigns).omit({
  id: true,
  createdAt: true,
});
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;

export const importSchedules = sqliteTable('import_schedules', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  frequency: text('frequency', { enum: scheduleFrequencies }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const insertImportScheduleSchema = createInsertSchema(importSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
});
export type InsertImportSchedule = z.infer<typeof insertImportScheduleSchema>;
export type ImportSchedule = typeof importSchedules.$inferSelect;

export const usersRelations = relations(users, ({ many }) => ({
  importJobs: many(importJobs),
  emailCampaigns: many(emailCampaigns),
  importSchedules: many(importSchedules),
}));

export const mediaItemsRelations = relations(mediaItems, ({ many }) => ({
  seasons: many(seasons),
  cast: many(mediaCast),
  thumbnails: many(mediaThumbnails),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  mediaItem: one(mediaItems, {
    fields: [seasons.mediaItemId],
    references: [mediaItems.id],
  }),
  episodes: many(episodes),
}));

export const episodesRelations = relations(episodes, ({ one }) => ({
  season: one(seasons, {
    fields: [episodes.seasonId],
    references: [seasons.id],
  }),
}));

export const castMembersRelations = relations(castMembers, ({ many }) => ({
  appearances: many(mediaCast),
}));

export const mediaCastRelations = relations(mediaCast, ({ one }) => ({
  mediaItem: one(mediaItems, {
    fields: [mediaCast.mediaItemId],
    references: [mediaItems.id],
  }),
  castMember: one(castMembers, {
    fields: [mediaCast.castMemberId],
    references: [castMembers.id],
  }),
}));

export const mediaThumbnailsRelations = relations(mediaThumbnails, ({ one }) => ({
  mediaItem: one(mediaItems, {
    fields: [mediaThumbnails.mediaItemId],
    references: [mediaItems.id],
  }),
}));

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  user: one(users, {
    fields: [importJobs.userId],
    references: [users.id],
  }),
}));

export const emailCampaignsRelations = relations(emailCampaigns, ({ one }) => ({
  user: one(users, {
    fields: [emailCampaigns.userId],
    references: [users.id],
  }),
}));

export const importSchedulesRelations = relations(importSchedules, ({ one }) => ({
  user: one(users, {
    fields: [importSchedules.userId],
    references: [users.id],
  }),
}));

export const newsletterSubscriptions = sqliteTable('newsletter_subscriptions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: text('email').notNull().unique(),
  mediaType: text('media_type', { enum: mediaTypes }),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const insertNewsletterSubscriptionSchema = createInsertSchema(newsletterSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertNewsletterSubscription = z.infer<typeof insertNewsletterSubscriptionSchema>;
export type NewsletterSubscription = typeof newsletterSubscriptions.$inferSelect;

export const newsletterDigests = sqliteTable('newsletter_digests', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  mediaType: text('media_type', { enum: mediaTypes }).notNull(),
  mediaItemIds: text('media_item_ids', { mode: 'json' })
    .$type<number[]>()
    .notNull(),
  recipientCount: integer('recipient_count').notNull().default(0),
  sentAt: text('sent_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const insertNewsletterDigestSchema = createInsertSchema(newsletterDigests).omit({
  id: true,
  createdAt: true,
  sentAt: true,
});
export type InsertNewsletterDigest = z.infer<typeof insertNewsletterDigestSchema>;
export type NewsletterDigest = typeof newsletterDigests.$inferSelect;

export const welcomeEmails = sqliteTable('welcome_emails', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: text('email').notNull(),
  status: text('status', { enum: emailStatuses }).notNull().default('sent'),
  emailId: text('email_id'),
  sentAt: text('sent_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const insertWelcomeEmailSchema = createInsertSchema(welcomeEmails).omit({
  id: true,
  createdAt: true,
  sentAt: true,
});
export type InsertWelcomeEmail = z.infer<typeof insertWelcomeEmailSchema>;
export type WelcomeEmail = typeof welcomeEmails.$inferSelect;

export const librarySections = sqliteTable('library_sections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sectionId: integer('section_id').notNull().unique(),
  sectionName: text('section_name').notNull(),
  sectionType: text('section_type', { enum: sectionTypes }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const insertLibrarySectionSchema = createInsertSchema(librarySections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLibrarySection = z.infer<typeof insertLibrarySectionSchema>;
export type LibrarySection = typeof librarySections.$inferSelect;

export const syncSchedules = sqliteTable('sync_schedules', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  jobType: text('job_type', { enum: jobTypes }).notNull(),
  cronExpression: text('cron_expression').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const insertSyncScheduleSchema = createInsertSchema(syncSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSyncSchedule = z.infer<typeof insertSyncScheduleSchema>;
export type SyncSchedule = typeof syncSchedules.$inferSelect;

export const tautulliConfig = sqliteTable('tautulli_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tautulliUrl: text('tautulli_url').notNull(),
  apiKey: text('api_key').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const insertTautulliConfigSchema = createInsertSchema(tautulliConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTautulliConfig = z.infer<typeof insertTautulliConfigSchema>;
export type TautulliConfig = typeof tautulliConfig.$inferSelect;

