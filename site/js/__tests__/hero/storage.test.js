import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

let originalLocalStorage;
let originalSessionStorage;
let originalDateNow;

function createStorage(){
  const store = new Map();
  return {
    getItem(key){ return store.has(key) ? store.get(key) : null; },
    setItem(key, value){ store.set(key, String(value)); },
    removeItem(key){ store.delete(key); },
    clear(){ store.clear(); },
    _dump(){ return store; }
  };
}

describe('hero storage cache handling', () => {
  beforeEach(() => {
    originalLocalStorage = global.localStorage;
    originalSessionStorage = global.sessionStorage;
    originalDateNow = Date.now;
    global.localStorage = createStorage();
    global.sessionStorage = createStorage();
    Date.now = () => 1_700_000_000_000;
  });

  afterEach(() => {
    if(originalLocalStorage) global.localStorage = originalLocalStorage;
    else delete global.localStorage;
    if(originalSessionStorage) global.sessionStorage = originalSessionStorage;
    else delete global.sessionStorage;
    Date.now = originalDateNow;
  });

  it('prefers session storage and honours expiration rules', async () => {
    const storageModule = await import(`../../hero/storage.js?${Date.now()}`);
    const base = 1_700_000_000_000;
    storageModule.storePool('movies', {
      items: [{ id: 'a', title: 'Alpha' }],
      updatedAt: base,
      expiresAt: base + 1_000,
      policyHash: 'abc123',
      slotSummary: { new: 1 }
    });

    const rawSession = global.sessionStorage.getItem('heroPool:movies:session');
    assert.ok(rawSession, 'expected pool snapshot to be written to sessionStorage');
    const rawLocal = global.localStorage.getItem('heroPool:movies');
    assert.ok(rawLocal, 'expected pool snapshot to be written to localStorage');

    const active = storageModule.getStoredPool('movies', { now: base + 500, policyHash: 'abc123' });
    assert.ok(active, 'expected cached pool before expiry');
    assert.equal(active.source, 'session');
    assert.equal(active.isExpired, false);
    assert.equal(active.matchesPolicy, true);

    const mismatch = storageModule.getStoredPool('movies', { now: base + 500, policyHash: 'xyz' });
    assert.equal(mismatch, null, 'policy hash mismatch should invalidate cache');

    const expired = storageModule.getStoredPool('movies', { now: base + 2_000, policyHash: 'abc123' });
    assert.equal(expired, null, 'expired pool should not be returned by default');

    const grace = storageModule.getStoredPool('movies', { now: base + 2_000, policyHash: 'abc123', allowExpired: true });
    assert.ok(grace, 'allowExpired should surface expired pool');
    assert.equal(grace.isExpired, true);

    storageModule.invalidatePool('movies');
    assert.equal(global.localStorage.getItem('heroPool:movies'), null);
    assert.equal(global.sessionStorage.getItem('heroPool:movies:session'), null);
  });
});
