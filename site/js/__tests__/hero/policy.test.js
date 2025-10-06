import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

let originalFetch;
let cleanupDom;

function installDom(){
  const { window } = parseHTML('<html><body></body></html>');
  window.requestAnimationFrame = window.requestAnimationFrame || (cb => setTimeout(() => cb(Date.now()), 0));
  window.cancelAnimationFrame = window.cancelAnimationFrame || (id => clearTimeout(id));
  global.window = window;
  global.document = window.document;
  global.CustomEvent = window.CustomEvent;
  global.requestAnimationFrame = window.requestAnimationFrame;
  global.cancelAnimationFrame = window.cancelAnimationFrame;
  cleanupDom = () => {
    delete global.window;
    delete global.document;
    delete global.CustomEvent;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
  };
}

describe('hero policy', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
    installDom();
  });

  afterEach(() => {
    if(originalFetch){
      global.fetch = originalFetch;
    }else{
      delete global.fetch;
    }
    cleanupDom?.();
  });

  it('sanitises invalid payloads and records validation issues', async () => {
    const responses = [];
    global.fetch = async (url) => {
      responses.push(url);
      return {
        ok: true,
        async json(){
          return {
            poolSizeMovies: -5,
            slots: {
              new: { quota: 0.6 },
              topRated: { quota: 3 },
              oldButGold: { quota: -0.2 }
            },
            diversity: { genre: 1.5, year: -1, antiRepeat: 0.9 },
            rotation: { intervalMinutes: 'foo', minPoolSize: 0 },
            textClamp: { title: 'bad', subtitle: -1, summary: 100 },
            fallback: { prefer: 'documentaries', allowDuplicates: 'nope' },
            language: '  ',
            cache: { ttlHours: 'abc', graceMinutes: -5 }
          };
        }
      };
    };

    const policyModule = await import(`../../hero/policy.js?${Date.now()}`);
    const policy = await policyModule.initHeroPolicy();

    assert.equal(policy.poolSizeMovies, 24);
    assert.equal(policy.poolSizeSeries, 16);
    assert.equal(policy.slots.new.quota, 0.6);
    assert.equal(policy.slots.topRated.quota, 0.3);
    assert.equal(policy.slots.oldButGold.quota, 0.2);
    assert.equal(policy.fallback.prefer, 'movies');
    assert.equal(policy.fallback.allowDuplicates, false);
    assert.equal(policy.language, 'en-US');
    assert.equal(policy.cache.ttlHours, 24);
    assert.equal(policy.cache.graceMinutes, 15);

    const slotConfig = policyModule.getSlotConfig();
    assert.deepEqual(slotConfig, {
      new: { quota: 0.6 },
      topRated: { quota: 0.3 },
      oldButGold: { quota: 0.2 },
      random: { quota: 0.2 }
    });

    const ttl = policyModule.getCacheTtl();
    assert.equal(ttl.ttlHours, 24);
    assert.equal(ttl.ttlMs, 24 * 60 * 60 * 1000);
    assert.equal(ttl.graceMinutes, 15);
    assert.equal(ttl.graceMs, 15 * 60 * 1000);

    const issues = policyModule.getValidationIssues();
    assert.ok(issues.length >= 5, 'expected validation issues for invalid payload');
    assert.ok(issues.some(msg => msg.includes('poolSizeMovies')));
    assert.ok(issues.some(msg => msg.includes('fallback.prefer')));
    assert.ok(policyModule.getPolicyLoadedAt() > 0);
    assert.ok(responses.some(url => String(url).includes('hero.policy.json')));
  });

  it('uses custom values from a valid policy payload', async () => {
    const payload = {
      poolSizeMovies: 8,
      poolSizeSeries: 4,
      slots: {
        new: { quota: 0.25 },
        topRated: { quota: 0.25 },
        oldButGold: { quota: 0.25 },
        random: { quota: 0.25 }
      },
      diversity: { genre: 0.5, year: 0.4, antiRepeat: 0.2 },
      rotation: { intervalMinutes: 120, minPoolSize: 3 },
      textClamp: { title: 80, subtitle: 160, summary: 200 },
      fallback: { prefer: 'shows', allowDuplicates: true },
      language: 'de-DE',
      cache: { ttlHours: 6, graceMinutes: 30 }
    };

    global.fetch = async (url) => {
      if(!String(url).includes('hero.policy.json')){
        throw new Error(`Unexpected fetch: ${url}`);
      }
      return { ok: true, json: async () => payload };
    };

    const policyModule = await import(`../../hero/policy.js?${Date.now()}`);
    await policyModule.initHeroPolicy();

    const policy = policyModule.getHeroPolicy();
    assert.equal(policy.poolSizeMovies, 8);
    assert.equal(policy.poolSizeSeries, 4);
    assert.equal(policy.language, 'de-DE');
    assert.equal(policy.fallback.prefer, 'series');
    assert.equal(policy.fallback.allowDuplicates, true);

    assert.deepEqual(policyModule.getPoolSizes(), { movies: 8, series: 4 });
    assert.deepEqual(policyModule.getDiversityWeights(), { genre: 0.5, year: 0.4, antiRepeat: 0.2 });
    assert.deepEqual(policyModule.getRotationConfig(), { intervalMinutes: 120, minPoolSize: 3 });
    assert.deepEqual(policyModule.getTextClampConfig(), { title: 80, subtitle: 160, summary: 200 });
    assert.deepEqual(policyModule.getFallbackPreference(), { prefer: 'series', allowDuplicates: true });
    assert.equal(policyModule.getPolicyLanguage(), 'de-DE');

    const ttl = policyModule.getCacheTtl();
    assert.equal(ttl.ttlHours, 6);
    assert.equal(ttl.ttlMs, 6 * 60 * 60 * 1000);
    assert.equal(ttl.graceMinutes, 30);
    assert.equal(ttl.graceMs, 30 * 60 * 1000);

    assert.deepEqual(policyModule.getValidationIssues(), []);
  });
});
