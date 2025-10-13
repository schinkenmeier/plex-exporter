import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import { applyTabs } from '../modalV3/tabs.js';
import { renderOverview } from '../modalV3/overview.js';
import { createHead } from '../modalV3/header.js';
import { buildMovieViewModel } from '../modalV3/viewModel.js';
import { setState, getState } from '../state.js';

function setupDom(){
  const { window } = parseHTML('<!doctype html><html lang="de"><body></body></html>');
  const cleanups = [];
  const MISSING = Symbol('missing');
  const assignGlobal = (key, value) => {
    const previous = Object.prototype.hasOwnProperty.call(globalThis, key) ? globalThis[key] : MISSING;
    globalThis[key] = value;
    cleanups.push(() => {
      if(previous === MISSING){ delete globalThis[key]; }
      else{ globalThis[key] = previous; }
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

describe('modalV3 UI helpers', () => {
  let cleanupDom;
  let stateSnapshot;

  beforeEach(() => {
    cleanupDom = setupDom();
    stateSnapshot = JSON.parse(JSON.stringify(getState()));
    setState({
      view: stateSnapshot.view,
      movies: stateSnapshot.movies,
      shows: stateSnapshot.shows,
      facets: stateSnapshot.facets,
      filtered: stateSnapshot.filtered,
      cfg: { ...stateSnapshot.cfg, lang: 'de-DE' },
      heroPolicy: stateSnapshot.heroPolicy,
      heroPolicyIssues: stateSnapshot.heroPolicyIssues,
    });
  });

  afterEach(() => {
    if(typeof cleanupDom === 'function'){
      cleanupDom();
      cleanupDom = null;
    }
    setState(stateSnapshot);
  });

  it('handles keyboard navigation for tabs', () => {
    const root = document.createElement('div');
    const tabs = document.createElement('div');
    tabs.className = 'v3-tabs';
    root.appendChild(tabs);

    const panels = [];
    const createTab = (id, label, selected = false) => {
      const button = document.createElement('button');
      button.dataset.tab = id;
      button.id = `tab-${id}`;
      button.setAttribute('aria-controls', `panel-${id}`);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
      button.textContent = label;
      tabs.appendChild(button);

      const panel = document.createElement('section');
      panel.dataset.pane = id;
      panel.id = `panel-${id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      panel.hidden = !selected;
      panel.textContent = `Pane ${label}`;
      root.appendChild(panel);
      panels.push(panel);
      return button;
    };

    const overviewBtn = createTab('overview', 'Überblick', true);
    createTab('details', 'Details', false);
    const seasonsBtn = createTab('seasons', 'Staffeln', false);

    applyTabs(root);

    assert.equal(overviewBtn.getAttribute('aria-selected'), 'true');
    assert.equal(panels[0].hidden, false);
    assert.equal(panels[1].hidden, true);

    const secondBtn = tabs.querySelector('[data-tab="details"]');
    secondBtn.click();
    assert.equal(secondBtn.getAttribute('aria-selected'), 'true');
    assert.equal(panels[1].hidden, false);
    assert.equal(panels[0].hidden, true);

    const keyEvent = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(keyEvent, 'key', { value: 'ArrowRight', configurable: true });
    secondBtn.dispatchEvent(keyEvent);
    assert.equal(document.activeElement, seasonsBtn);
    assert.equal(seasonsBtn.getAttribute('aria-selected'), 'true');
    assert.equal(panels[2].hidden, false);
  });

  it('renders overview with toggle and language badge', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const viewModel = {
      overview: 'Dies ist ein sehr langer Text, der die Geschichte ausführlich beschreibt und mehrere Sätze umfasst, sodass ein Umbruch erforderlich ist.',
      summary: 'Kurzfassung',
      tmdb: { originalLanguage: 'en' },
      item: {},
    };

    renderOverview(container, viewModel);

    const paragraph = container.querySelector('.v3-overview__text');
    assert.ok(paragraph, 'Paragraph should exist');

    Object.defineProperty(paragraph, 'scrollHeight', { get: () => 200, configurable: true });
    Object.defineProperty(paragraph, 'clientHeight', { get: () => 100, configurable: true });

    await new Promise(resolve => setTimeout(resolve, 0));

    const toggle = container.querySelector('.v3-overview__toggle');
    assert.ok(toggle, 'Toggle should exist');
    assert.equal(toggle.hidden, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');

    toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(paragraph.classList.contains('is-expanded'));

    const badge = container.querySelector('[data-badge="language"]');
    assert.ok(badge, 'Language badge should be rendered');
    assert.equal(badge.textContent, 'EN');
  });

  it('renders hero logo for movies when TMDB logos are available', async () => {
    const tmdbDetail = {
      id: 123,
      title: 'Logo Film',
      releaseDate: '2020-01-01',
      images: {
        logos: [
          { file_path: '/de-logo.png', url: 'https://image.tmdb.org/t/p/w500/de-logo.png', iso_639_1: 'de' },
          { file_path: '/en-logo.png', url: 'https://image.tmdb.org/t/p/w500/en-logo.png', iso_639_1: 'en' },
        ],
      },
    };

    const viewModel = await buildMovieViewModel({
      item: {
        type: 'movie',
        title: 'Logo Film',
        ids: { tmdb: '123' },
        tmdbId: '123',
      },
    }, { tmdb: tmdbDetail });

    assert.ok(Array.isArray(viewModel?.tmdb?.images?.logos), 'View model should expose TMDB logos');
    assert.equal(viewModel.tmdb.images.logos.length, 2);

    const head = createHead(viewModel);
    assert.ok(head?.elements?.overlayLogo, 'Overlay logo slot should exist');

    const overlayLogo = head.elements.overlayLogo;
    const overlayImg = overlayLogo.querySelector('img');
    assert.ok(overlayImg, 'Overlay logo slot should contain an image');
    assert.equal(overlayLogo.hidden, false);
    assert.equal(overlayLogo.dataset.state, 'ready');
    assert.equal(overlayImg.getAttribute('src'), tmdbDetail.images.logos[0].url);

    const secondaryLogo = head.elements.logo;
    const secondaryImg = secondaryLogo?.querySelector('img');
    assert.ok(secondaryImg, 'Secondary logo slot should contain an image');
    assert.equal(secondaryImg.getAttribute('src'), tmdbDetail.images.logos[1].url);
  });
});
