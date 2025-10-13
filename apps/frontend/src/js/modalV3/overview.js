import { getState } from '../state.js';

let paragraphIdCounter = 0;

function nextParagraphId(){
  paragraphIdCounter += 1;
  return `modalv3-overview-${paragraphIdCounter}`;
}

function ensureContainer(target){
  if(!target) return null;
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(target instanceof elementCtor) return target;
  if(elementCtor && target.content instanceof elementCtor) return target.content;
  if(elementCtor && target.root instanceof elementCtor) return target.root;
  return null;
}

function sanitizeText(value){
  if(value == null) return '';
  const str = String(value);
  return str.trim();
}

function getPreferredLanguage(){
  const state = typeof getState === 'function' ? getState() : null;
  const lang = state?.cfg?.lang || state?.cfg?.iso || state?.cfg?.locale;
  return typeof lang === 'string' && lang.trim() ? lang.trim() : 'de-DE';
}

function resolveOriginalLanguage(viewModel){
  const tmdb = viewModel?.tmdb || viewModel?.item?.tmdbDetail || viewModel?.item?.tmdb || null;
  const candidates = [
    tmdb?.originalLanguage,
    tmdb?.original_language,
    viewModel?.item?.originalLanguage,
    viewModel?.item?.original_language,
    tmdb?.languages?.[0],
  ];
  for(const entry of candidates){
    if(!entry) continue;
    const str = sanitizeText(entry).toLowerCase();
    if(str) return str;
  }
  return '';
}

function determineLanguageBadge(viewModel){
  const original = resolveOriginalLanguage(viewModel);
  if(!original) return '';
  const preferred = getPreferredLanguage().toLowerCase();
  if(original === 'en' && preferred && !preferred.startsWith('en')){
    return 'EN';
  }
  return '';
}

function createFallback(){
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Keine Inhaltsangabe verfügbar.';
  paragraph.className = 'v3-overview__fallback';
  return paragraph;
}

function buildOverviewElements(container, viewModel){
  const text = sanitizeText(viewModel?.overview) || sanitizeText(viewModel?.summary);
  const elements = { items: [] };
  const languageBadge = determineLanguageBadge(viewModel);

  if(languageBadge){
    const badge = document.createElement('span');
    badge.className = 'v3-chip';
    badge.dataset.badge = 'language';
    badge.textContent = languageBadge;
    badge.setAttribute('aria-label', `Sprache: ${languageBadge}`);
    elements.items.push(badge);
  }

  if(!text){
    elements.items.push(createFallback());
    return elements;
  }

  const paragraphId = nextParagraphId();
  const paragraph = document.createElement('p');
  paragraph.className = 'v3-overview__text line-clamp line-clamp-5';
  paragraph.id = paragraphId;
  paragraph.textContent = text;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'v3-overview__toggle';
  toggle.setAttribute('aria-controls', paragraphId);
  toggle.dataset.overviewToggle = '1';

  elements.paragraph = paragraph;
  elements.toggle = toggle;
  elements.items.push(paragraph, toggle);

  return elements;
}

function scheduleMeasure(fn){
  if(typeof requestAnimationFrame === 'function'){
    return requestAnimationFrame(fn);
  }
  return setTimeout(fn, 0);
}

function setExpanded(container, paragraph, toggle, expanded){
  const isExpanded = Boolean(expanded);
  paragraph.classList.toggle('is-expanded', isExpanded);
  toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  toggle.textContent = isExpanded ? 'Weniger anzeigen' : 'Mehr anzeigen';
  if(container?.dataset) container.dataset.overviewExpanded = isExpanded ? 'true' : 'false';
}

function measureOverflow(paragraph, toggle){
  if(!paragraph || !toggle) return;
  try{
    const overflowing = paragraph.scrollHeight > paragraph.clientHeight + 1;
    toggle.hidden = !overflowing;
    if(!overflowing){
      paragraph.classList.add('is-expanded');
      toggle.setAttribute('aria-expanded', 'true');
      const container = paragraph.parentElement;
      if(container?.dataset) container.dataset.overviewExpanded = 'true';
    }
  }catch(err){
    console.warn('[modalV3/overview] Failed to measure overview paragraph:', err?.message || err);
  }
}

export function renderOverview(target, viewModel){
  if(typeof document === 'undefined') return;
  const container = ensureContainer(target);
  if(!container) return;
  const previousExpanded = container.dataset?.overviewExpanded === 'true';
  container.replaceChildren();

  const elements = buildOverviewElements(container, viewModel || {});
  elements.items.forEach(node => container.appendChild(node));

  if(!elements.paragraph || !elements.toggle) return;

  const { paragraph, toggle } = elements;
  const stateToApply = previousExpanded && !toggle.hidden;
  setExpanded(container, paragraph, toggle, stateToApply);

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    setExpanded(container, paragraph, toggle, !expanded);
  });

  scheduleMeasure(() => measureOverflow(paragraph, toggle));
}

export default renderOverview;
