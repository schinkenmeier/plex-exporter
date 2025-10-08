import { getState } from '../state.js';

function resolveOverviewPane(target){
  if(!target) return null;
  if(target instanceof HTMLElement){
    return target.classList.contains('v2-overview') ? target : target.querySelector('.v2-overview');
  }
  if(target?.overview instanceof HTMLElement) return target.overview;
  return null;
}

export function renderOverview(target, item){
  const pane = resolveOverviewPane(target);
  if(!pane) return;

  const tmdb = (item?.tmdbDetail?.overview || '').trim();
  const local = (item?.summary || item?.overview || '').trim();
  const overview = tmdb || local;

  if(!overview){
    pane.textContent = '';
    return;
  }

  const previousParagraph = pane.querySelector('.v2-overview-text');
  const wasExpanded = previousParagraph?.classList.contains('is-expanded')
    || pane.querySelector('.v2-overview-toggle')?.getAttribute('aria-expanded') === 'true';

  const paragraph = document.createElement('p');
  paragraph.className = 'v2-overview-text line-clamp line-clamp-5';
  paragraph.textContent = overview;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'v2-overview-toggle';

  const setExpanded = (expanded)=>{
    paragraph.classList.toggle('is-expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Weniger anzeigen' : 'Mehr anzeigen';
  };

  toggle.addEventListener('click', ()=>{
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    setExpanded(!expanded);
  });

  const badgeText = determineLanguageBadge(item, tmdb ? 'tmdb' : 'local');
  let badge = null;
  if(badgeText){
    badge = document.createElement('span');
    badge.className = 'v2-lang-badge';
    badge.textContent = badgeText;
  }

  const children = [];
  if(badge) children.push(badge);
  children.push(paragraph, toggle);
  pane.replaceChildren(...children);
  setExpanded(Boolean(wasExpanded));

  const measure = ()=>{
    const overflowing = paragraph.scrollHeight > paragraph.clientHeight + 1;
    if(!overflowing){
      paragraph.classList.add('is-expanded');
      toggle.hidden = true;
    }else{
      toggle.hidden = false;
    }
  };
  const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb)=>setTimeout(cb, 0);
  schedule(measure);
}

export function updateOverview(root, item){
  renderOverview(root, item);
}

function determineLanguageBadge(item, source){
  if(source !== 'tmdb') return '';
  const cfgLang = String(item?.tmdbDetail?.raw?.spoken_languages?.[0]?.iso_639_1 || '').toLowerCase();
  const original = String(item?.tmdbDetail?.raw?.original_language || '').toLowerCase();
  const stateLang = String(getPreferredLanguage()).toLowerCase();
  const effective = original || cfgLang;
  if(effective === 'en' && stateLang && !stateLang.startsWith('en')){
    return 'EN';
  }
  return '';
}

function getPreferredLanguage(){
  const state = getState();
  if(state?.cfg?.lang) return state.cfg.lang;
  return 'de-DE';
}
