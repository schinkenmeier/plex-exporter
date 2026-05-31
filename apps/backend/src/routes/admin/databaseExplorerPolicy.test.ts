import { describe, expect, it } from 'vitest';
import {
  classifyDatabaseExplorerColumn,
  databaseExplorerTablePolicies,
  getDatabaseExplorerTablePolicy,
} from './databaseExplorerPolicy.js';

describe('database explorer policy', () => {
  it('uses a strict table allowlist', () => {
    expect(getDatabaseExplorerTablePolicy('media_items')).not.toBeNull();
    expect(getDatabaseExplorerTablePolicy('users')).toBeNull();
    expect(getDatabaseExplorerTablePolicy('integration_settings')).toBeNull();
    expect(getDatabaseExplorerTablePolicy('tautulli_config')).toBeNull();
    expect(getDatabaseExplorerTablePolicy('schema_migrations')).toBeNull();
  });

  it('classifies sensitive columns as non-selectable and non-queryable', () => {
    const policy = databaseExplorerTablePolicies.get('media_items');
    expect(policy).toBeDefined();

    const secret = classifyDatabaseExplorerColumn(policy!, 'api_key');
    expect(secret).toEqual(expect.objectContaining({
      sensitivity: 'secret',
      selectable: false,
      searchable: false,
      filterable: false,
      enumSafe: false,
    }));

    const pii = classifyDatabaseExplorerColumn(policy!, 'requester_email');
    expect(pii).toEqual(expect.objectContaining({
      sensitivity: 'pii',
      selectable: true,
      searchable: false,
      filterable: false,
      enumSafe: false,
    }));

    const privateText = classifyDatabaseExplorerColumn(policy!, 'admin_note');
    expect(privateText).toEqual(expect.objectContaining({
      sensitivity: 'private_text',
      searchable: false,
      filterable: false,
      enumSafe: false,
    }));
  });

  it('honors explicit column policy overrides over name-derived defaults', () => {
    const policy = databaseExplorerTablePolicies.get('media_items');
    expect(policy).toBeDefined();

    const summary = classifyDatabaseExplorerColumn(policy!, 'summary');
    expect(summary).toEqual(expect.objectContaining({
      sensitivity: 'private_text',
      selectable: true,
      searchable: false,
      filterable: false,
      enumSafe: false,
    }));

    const type = classifyDatabaseExplorerColumn(policy!, 'type');
    expect(type).toEqual(expect.objectContaining({
      sensitivity: 'public_catalog',
      filterable: true,
      enumSafe: true,
    }));
  });
});
