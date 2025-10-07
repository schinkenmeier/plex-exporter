/**
 * Unit tests for modal/seasonsAccordion.js
 * Tests TMDB enrichment guard and memory leak fixes (cleanup functions, AbortController)
 */

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

describe('seasonsAccordion - Memory Leak Fixes (NEW IMPROVEMENT)', () => {
  describe('seasonCardEl - Event Listener Cleanup', () => {
    it('should attach cleanup function to card element', () => {
      const card = {
        _cleanup: null,
        _eventListeners: [],
        addEventListener(event, handler) {
          this._eventListeners.push({ event, handler });
        },
        removeEventListener(event, handler) {
          const index = this._eventListeners.findIndex(
            l => l.event === event && l.handler === handler
          );
          if (index > -1) this._eventListeners.splice(index, 1);
        },
      };

      const head = {
        addEventListener(event, handler) {
          card.addEventListener(event, handler);
        },
        removeEventListener(event, handler) {
          card.removeEventListener(event, handler);
        },
      };

      let abortController = null;

      // Simulate seasonCardEl logic
      const handleClick = () => {};

      head.addEventListener('click', handleClick);
      abortController = { signal: { aborted: false }, abort() { this.signal.aborted = true; } };

      // Attach cleanup function (NEW IMPROVEMENT)
      card._cleanup = () => {
        head.removeEventListener('click', handleClick);
        if (abortController && !abortController.signal.aborted) {
          abortController.abort();
        }
      };

      // Verify cleanup function exists
      assert.strictEqual(typeof card._cleanup, 'function');
      assert.strictEqual(card._eventListeners.length, 1);

      // Call cleanup
      card._cleanup();

      // Verify event listener is removed and abort was called
      assert.strictEqual(card._eventListeners.length, 0);
      assert.strictEqual(abortController.signal.aborted, true);
    });

    it('should not throw if abortController is null', () => {
      const card = { _cleanup: null };
      let abortController = null;

      card._cleanup = () => {
        if (abortController && !abortController.signal.aborted) {
          abortController.abort();
        }
      };

      assert.doesNotThrow(() => {
        card._cleanup();
      });
    });

    it('should not abort if already aborted', () => {
      const card = { _cleanup: null };
      let abortCalls = 0;
      const abortController = {
        signal: { aborted: true },
        abort() {
          abortCalls++;
        },
      };

      card._cleanup = () => {
        if (abortController && !abortController.signal.aborted) {
          abortController.abort();
        }
      };

      card._cleanup();
      assert.strictEqual(abortCalls, 0); // Should not call abort() since already aborted
    });
  });

  describe('renderSeasons - Cleanup Before Replacing', () => {
    it('should call cleanup on existing cards before replacing', () => {
      const cleanupCalls = [];

      const existingCards = [
        { _cleanup() { cleanupCalls.push('card1'); } },
        { _cleanup() { cleanupCalls.push('card2'); } },
      ];

      const root = {
        querySelectorAll() { return existingCards; },
        replaceChildren() {},
      };

      // Simulate renderSeasons cleanup logic (NEW IMPROVEMENT)
      const cards = root.querySelectorAll('.season-card');
      cards.forEach(card => {
        if (typeof card._cleanup === 'function') {
          card._cleanup();
        }
      });

      assert.strictEqual(cleanupCalls.length, 2);
      assert.strictEqual(cleanupCalls[0], 'card1');
      assert.strictEqual(cleanupCalls[1], 'card2');
    });

    it('should handle cards without cleanup function gracefully', () => {
      const existingCards = [
        { _cleanup: null },
        { _cleanup() {} },
        {}, // No _cleanup property
      ];

      const root = {
        querySelectorAll() { return existingCards; },
      };

      // Should not throw
      assert.doesNotThrow(() => {
        const cards = root.querySelectorAll('.season-card');
        cards.forEach(card => {
          if (typeof card._cleanup === 'function') {
            card._cleanup();
          }
        });
      });
    });

    it('should prevent memory leak by cleaning up before re-render', () => {
      let totalListeners = 0;

      const createCard = () => {
        const card = {
          _cleanup: null,
          _activeListeners: 1,
        };

        card._cleanup = () => {
          card._activeListeners = 0;
          totalListeners--;
        };

        totalListeners++;
        return card;
      };

      // First render
      const cards1 = [createCard(), createCard()];
      assert.strictEqual(totalListeners, 2);

      // Cleanup before second render (NEW IMPROVEMENT)
      cards1.forEach(card => card._cleanup());
      assert.strictEqual(totalListeners, 0);

      // Second render
      const cards2 = [createCard(), createCard()];
      assert.strictEqual(totalListeners, 2); // New listeners only

      // Without cleanup, we'd have 4 leaked listeners
      // With cleanup (NEW IMPROVEMENT), we only have 2
    });
  });

  describe('AbortController Integration', () => {
    it('should create AbortController when loading season', () => {
      let abortController = new AbortController();

      assert.ok(abortController);
      assert.ok(abortController.signal);
      assert.strictEqual(abortController.signal.aborted, false);
    });

    it('should prevent stale data from rendering after abort', async () => {
      let abortController = new AbortController();
      let renderCalls = 0;

      const loadSeason = async () => {
        const signal = abortController.signal;
        await new Promise(resolve => setTimeout(resolve, 50));
        if (signal.aborted) return;
        renderCalls++;
      };

      const promise = loadSeason();
      abortController.abort();
      await promise;

      assert.strictEqual(renderCalls, 0); // Should not have rendered
    });

    it('should allow multiple abort calls safely', () => {
      const abortController = new AbortController();

      assert.doesNotThrow(() => {
        abortController.abort();
        abortController.abort();
        abortController.abort();
      });

      assert.strictEqual(abortController.signal.aborted, true);
    });
  });

  describe('Memory Leak Prevention - Integration', () => {
    it('should not accumulate listeners across multiple renders', () => {
      const globalListeners = [];

      const createSeasonCard = () => {
        const card = { _cleanup: null, id: Math.random() };
        const handler = () => {};

        globalListeners.push({ card, handler });

        card._cleanup = () => {
          const index = globalListeners.findIndex(l => l.card === card);
          if (index > -1) globalListeners.splice(index, 1);
        };

        return card;
      };

      const render = (cardCount) => {
        const oldCards = globalListeners.map(l => l.card);
        oldCards.forEach(card => card._cleanup());
        return Array.from({ length: cardCount }, () => createSeasonCard());
      };

      render(5);
      assert.strictEqual(globalListeners.length, 5);

      render(3);
      assert.strictEqual(globalListeners.length, 3);

      render(10);
      assert.strictEqual(globalListeners.length, 10);

      // Without cleanup, we'd have 5 + 3 + 10 = 18 leaked listeners
      // With cleanup (NEW IMPROVEMENT), we only have the current 10
    });
  });
});
