import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import TautulliSnapshotRepository from '../../src/repositories/tautulliSnapshotRepository.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';
import { tautulliSnapshots } from '../../src/db/schema.js';

describe('TautulliSnapshotRepository', () => {
  let dbHandle: TestDatabaseHandle;
  let repository: TautulliSnapshotRepository;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    repository = new TautulliSnapshotRepository(dbHandle.drizzle, { maxSnapshots: 3 });
  });

  afterEach(() => {
    dbHandle.cleanup();
  });

  it('keeps only the most recent snapshots based on the configured limit', () => {
    for (let index = 0; index < 5; index += 1) {
      repository.recordSnapshot({ index });
    }

    const snapshots = repository.listLatest<{ index: number }>(10);
    expect(snapshots).toHaveLength(3);
    expect(snapshots.map((snapshot) => snapshot.payload.index)).toEqual([4, 3, 2]);

    const allRows = dbHandle.drizzle.select().from(tautulliSnapshots).all();
    expect(allRows).toHaveLength(3);
  });

  it('allows updating the retention limit at runtime', () => {
    repository.setMaxSnapshots(1);
    for (let index = 0; index < 3; index += 1) {
      repository.recordSnapshot({ index });
    }
    repository.enforceRetention();

    const snapshots = repository.listLatest<{ index: number }>(5);
    expect(snapshots).toHaveLength(1);
    expect(repository.getMaxSnapshots()).toBe(1);
  });
});
