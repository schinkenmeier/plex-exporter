import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import { renderCast } from '../../src/features/modal/modalV3/cast.js';

function setupDom(){
  const { window } = parseHTML('<!doctype html><html lang="de"><body></body></html>');
  const cleanups = [];
  const MISSING = Symbol('missing');
  const assignGlobal = (key, value) => {
    const previous = Object.prototype.hasOwnProperty.call(globalThis, key) ? globalThis[key] : MISSING;
    globalThis[key] = value;
    cleanups.push(() => {
      if(previous === MISSING){
        delete globalThis[key];
      }else{
        globalThis[key] = previous;
      }
    });
  };

  assignGlobal('window', window);
  assignGlobal('document', window.document);
  assignGlobal('HTMLElement', window.HTMLElement);
  assignGlobal('Node', window.Node);
  assignGlobal('Event', window.Event);
  assignGlobal('CustomEvent', window.CustomEvent);
  assignGlobal('requestAnimationFrame', window.requestAnimationFrame || (cb => setTimeout(() => cb(Date.now()), 0)));
  assignGlobal('cancelAnimationFrame', window.cancelAnimationFrame || (id => clearTimeout(id)));

  return () => {
    while(cleanups.length){
      const cleanup = cleanups.pop();
      cleanup();
    }
  };
}

describe('modalV3 cast rendering', () => {
  let cleanupDom;

  beforeEach(() => {
    cleanupDom = setupDom();
  });

  afterEach(() => {
    if(typeof cleanupDom === 'function'){
      cleanupDom();
      cleanupDom = null;
    }
  });

  it('renders TMDB profile images when tmdbDetail credits are present', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const payload = {
      item: {
        cast: [
          { name: 'Lokaler Star', role: 'Held', thumb: '/library/local.jpg' }
        ],
        tmdbDetail: {
          credits: {
            cast: [
              { name: 'TMDB Star', character: 'Sidekick', profile_path: '/tmdb-profile.jpg' }
            ]
          }
        }
      }
    };

    renderCast(container, payload);

    const root = container.querySelector('[data-v3-cast]');
    assert.ok(root, 'cast root should be rendered');
    const cards = Array.from(root.querySelectorAll('.v3-cast-card'));
    const tmdbCard = cards.find(card => card.querySelector('.v3-cast-card__name')?.textContent === 'TMDB Star');
    assert.ok(tmdbCard, 'TMDB cast card should be present');
    const image = tmdbCard.querySelector('img');
    assert.ok(image, 'TMDB cast card should include an image');
    assert.equal(image.getAttribute('src'), 'https://image.tmdb.org/t/p/w185/tmdb-profile.jpg');
  });

  it('uses TMDB profiles provided via payload.cast entries', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const payload = {
      cast: [
        { name: 'Direkter TMDB Star', role: 'Gast', tmdbProfile: '/direct-tmdb.jpg' }
      ]
    };

    renderCast(container, payload);

    const root = container.querySelector('[data-v3-cast]');
    assert.ok(root, 'cast root should be rendered');
    const card = root.querySelector('.v3-cast-card');
    assert.ok(card, 'Cast card should be rendered');
    const image = card.querySelector('img');
    assert.ok(image, 'Cast card should use TMDB profile image');
    assert.equal(image.getAttribute('src'), 'https://image.tmdb.org/t/p/w185/direct-tmdb.jpg');
  });
});
