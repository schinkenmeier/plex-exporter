export type DatabaseExplorerSensitivity =
  | 'public_catalog'
  | 'internal_id'
  | 'private_text'
  | 'pii'
  | 'secret';

export interface DatabaseExplorerColumnPolicy {
  sensitivity?: DatabaseExplorerSensitivity;
  selectable?: boolean;
  sortable?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  rangeFilterable?: boolean;
  enumSafe?: boolean;
}

export interface DatabaseExplorerTablePolicy {
  name: string;
  label: string;
  category: string;
  description: string;
  defaultColumns: string[];
  columns?: Record<string, DatabaseExplorerColumnPolicy>;
}

const enumSafe = (): DatabaseExplorerColumnPolicy => ({
  filterable: true,
  enumSafe: true,
});

const privateText = (): DatabaseExplorerColumnPolicy => ({
  sensitivity: 'private_text',
  searchable: false,
  filterable: false,
  enumSafe: false,
});

const internalId = (): DatabaseExplorerColumnPolicy => ({
  sensitivity: 'internal_id',
  searchable: false,
  enumSafe: false,
});

const allowedTables: DatabaseExplorerTablePolicy[] = [
  {
    name: 'media_items',
    label: 'Media Items',
    category: 'catalog',
    description: 'Movies and shows imported from Plex/Tautulli.',
    defaultColumns: ['id', 'type', 'title', 'year', 'rating', 'library_section_id', 'created_at', 'updated_at'],
    columns: {
      type: enumSafe(),
      title: { searchable: true, filterable: true },
      sort_title: { searchable: true, filterable: true },
      content_rating: enumSafe(),
      genres: { sensitivity: 'public_catalog', searchable: true },
      directors: { sensitivity: 'public_catalog', searchable: true },
      writers: { sensitivity: 'public_catalog', searchable: true },
      languages: { sensitivity: 'public_catalog', searchable: true },
      countries: { sensitivity: 'public_catalog', searchable: true },
      collections: { sensitivity: 'public_catalog', searchable: true },
      summary: privateText(),
      tagline: privateText(),
      tautulli_id: internalId(),
      guid: internalId(),
      poster: internalId(),
      backdrop: internalId(),
      trailer_url: internalId(),
      trailer_youtube_id: internalId(),
    },
  },
  {
    name: 'seasons',
    label: 'Seasons',
    category: 'catalog',
    description: 'Season records linked to imported shows.',
    defaultColumns: ['id', 'media_item_id', 'season_number', 'title', 'episode_count'],
    columns: {
      tautulli_id: internalId(),
      summary: privateText(),
      poster: internalId(),
    },
  },
  {
    name: 'episodes',
    label: 'Episodes',
    category: 'catalog',
    description: 'Episode records linked to seasons.',
    defaultColumns: ['id', 'season_id', 'episode_number', 'title', 'air_date', 'duration'],
    columns: {
      tautulli_id: internalId(),
      title: { searchable: true, filterable: true },
      summary: privateText(),
      thumb: internalId(),
    },
  },
  {
    name: 'cast_members',
    label: 'Cast Members',
    category: 'catalog',
    description: 'Normalized cast member records.',
    defaultColumns: ['id', 'name', 'role'],
    columns: {
      name: { searchable: true, filterable: true },
      role: enumSafe(),
      photo: internalId(),
    },
  },
  {
    name: 'media_cast',
    label: 'Media Cast Links',
    category: 'catalog',
    description: 'Join records between media and cast members.',
    defaultColumns: ['id', 'media_item_id', 'cast_member_id', 'character', 'order'],
    columns: {
      character: { searchable: true, filterable: true },
    },
  },
  {
    name: 'media_thumbnails',
    label: 'Media Thumbnails',
    category: 'catalog',
    description: 'Thumbnail records generated for catalog media.',
    defaultColumns: ['id', 'media_item_id', 'path', 'created_at'],
    columns: {
      path: internalId(),
    },
  },
  {
    name: 'library_sections',
    label: 'Library Sections',
    category: 'sync',
    description: 'Configured Tautulli library sections.',
    defaultColumns: ['id', 'section_id', 'section_name', 'section_type', 'enabled', 'last_synced_at'],
    columns: {
      section_name: { searchable: true, filterable: true },
      section_type: enumSafe(),
      enabled: enumSafe(),
    },
  },
  {
    name: 'sync_schedules',
    label: 'Sync Schedules',
    category: 'sync',
    description: 'Configured scheduler jobs.',
    defaultColumns: ['id', 'job_type', 'cron_expression', 'enabled', 'last_run_at', 'next_run_at'],
    columns: {
      job_type: enumSafe(),
      enabled: enumSafe(),
    },
  },
  {
    name: 'newsletter_digests',
    label: 'Newsletter Digests',
    category: 'newsletter',
    description: 'Legacy newsletter digest history.',
    defaultColumns: ['id', 'media_type', 'recipient_count', 'sent_at', 'created_at'],
    columns: {
      media_type: enumSafe(),
      media_item_ids: privateText(),
    },
  },
  {
    name: 'newsletter_campaigns',
    label: 'Newsletter Campaigns',
    category: 'newsletter',
    description: 'Newsletter campaign draft and delivery records without recipients.',
    defaultColumns: ['id', 'subject', 'media_type', 'status', 'recipient_count', 'sent_count', 'failed_count', 'created_at', 'updated_at'],
    columns: {
      subject: { searchable: true, filterable: true },
      body: privateText(),
      media_type: enumSafe(),
      status: enumSafe(),
      media_item_ids: privateText(),
      last_error_message: privateText(),
    },
  },
  {
    name: 'hero_pools',
    label: 'Hero Pools',
    category: 'catalog',
    description: 'Cached hero pool metadata.',
    defaultColumns: ['kind', 'policy_hash', 'expires_at', 'updated_at'],
    columns: {
      kind: enumSafe(),
      payload: privateText(),
      history: privateText(),
      policy_hash: internalId(),
    },
  },
];

export const databaseExplorerTablePolicies = new Map(
  allowedTables.map(policy => [policy.name, policy]),
);

const SECRET_COLUMN_PATTERN = /(password|api_?key|apikey|token|authorization|secret|access_?token)/i;
const PII_COLUMN_PATTERN = /(^email$|_email$|email_|recipient_emails|requester_email|from_email|admin_email)/i;
const PRIVATE_TEXT_COLUMN_PATTERN = /(message|admin_note|error_message|payload|history|template|body|items|summary|tagline)/i;
const INTERNAL_ID_COLUMN_PATTERN = /(tautulli_id|guid|email_id|confirmation_email_id|notification_email_id|response_email_id|poster|backdrop|thumb|path|url|youtube_id|policy_hash)/i;
const RANGE_COLUMN_PATTERN = /(^id$|_id$|count$|number$|rating$|duration$|year$|_at$|date$|expires_at|updated_at|created_at|sent_at|last_run_at|next_run_at|last_synced_at)/i;

export const classifyDatabaseExplorerColumn = (
  tablePolicy: DatabaseExplorerTablePolicy,
  columnName: string,
): Required<DatabaseExplorerColumnPolicy> => {
  const explicit = tablePolicy.columns?.[columnName] ?? {};
  const lowerName = columnName.toLowerCase();
  const sensitivity: DatabaseExplorerSensitivity =
    explicit.sensitivity ??
    (SECRET_COLUMN_PATTERN.test(lowerName)
      ? 'secret'
      : PII_COLUMN_PATTERN.test(lowerName)
        ? 'pii'
        : PRIVATE_TEXT_COLUMN_PATTERN.test(lowerName)
          ? 'private_text'
          : INTERNAL_ID_COLUMN_PATTERN.test(lowerName)
            ? 'internal_id'
            : 'public_catalog');

  const isSecret = sensitivity === 'secret';
  const isPii = sensitivity === 'pii';
  const isPrivate = sensitivity === 'private_text';
  const isInternal = sensitivity === 'internal_id';
  const rangeCapable = RANGE_COLUMN_PATTERN.test(lowerName);

  return {
    sensitivity,
    selectable: explicit.selectable ?? !isSecret,
    sortable: explicit.sortable ?? (!isSecret && !isPrivate && !isPii),
    searchable: explicit.searchable ?? (!isSecret && !isPii && !isPrivate && !isInternal),
    filterable: explicit.filterable ?? (!isSecret && !isPii && !isPrivate),
    rangeFilterable: explicit.rangeFilterable ?? (!isSecret && !isPii && !isPrivate && rangeCapable),
    enumSafe: explicit.enumSafe ?? false,
  };
};

export const getDatabaseExplorerTablePolicy = (
  tableName: string,
): DatabaseExplorerTablePolicy | null => databaseExplorerTablePolicies.get(tableName) ?? null;
