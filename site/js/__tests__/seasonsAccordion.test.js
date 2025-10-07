import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';

const metadataServiceModule = await import('../metadataService.js');
const metadataService = metadataServiceModule.default;

describe('seasonsAccordion TMDB enrichment guard', () => {
  let originalWindow;
  let originalDocument;
  let originalElement;
  let originalHTMLElement;
  let originalImage;
  let originalLocalStorage;
  let originalFeatures;
  let originalConfig;

  beforeEach(() => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    originalWindow = global.window;
    originalDocument = global.document;
    originalElement = global.Element;
    originalHTMLElement = global.HTMLElement;
    originalImage = global.Image;
    originalLocalStorage = global.localStorage;

    originalFeatures = originalWindow?.FEATURES;

    global.window = window;
    global.document = window.document;
    global.Element = window.Element;
    global.HTMLElement = window.HTMLElement;
    global.Image = window.Image;
    global.window.FEATURES = { tmdbEnrichment: true };

    global.localStorage = {
      getItem() { return ''; },
      setItem() {},
      removeItem() {},
    };

    originalConfig = metadataService.config;
    metadataService.configure({ token: '', apiKey: '' });
  });

  afterEach(() => {
    metadataService.configure(originalConfig);
    global.window = originalWindow;
    global.document = originalDocument;
    global.Element = originalElement;
    global.HTMLElement = originalHTMLElement;
    global.Image = originalImage;
    global.localStorage = originalLocalStorage;
    if(global.window){
      global.window.FEATURES = originalFeatures;
    }
  });

  it('skips enrichment when TMDB credentials are missing', async () => {
    let callCount = 0;
    const originalFn = metadataService.getSeasonEnriched;
    metadataService.getSeasonEnriched = async () => {
      callCount += 1;
      return null;
    };

    try {
      const { renderSeasonsAccordion } = await import(`../modal/seasonsAccordion.js?${Date.now()}`);
      const root = document.getElementById('root');
      const seasons = [{ seasonNumber: 1, title: 'Season 1', episodes: [] }];
      const show = { ids: { tmdb: '12345' }, title: 'Demo Show' };

      renderSeasonsAccordion(root, seasons, { show });

      const head = document.querySelector('.season-head');
      head.dispatchEvent(new window.Event('click'));

      assert.strictEqual(callCount, 0, 'expected no enrichment call without credentials');
    } finally {
      metadataService.getSeasonEnriched = originalFn;
    }
  });
});
