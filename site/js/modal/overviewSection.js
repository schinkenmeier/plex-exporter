import { getState } from '../state.js';

let headingIdCounter = 0;

function nextHeadingId(prefix){
  headingIdCounter += 1;
  const base = prefix ? `overview-${prefix}` : 'overview-card';
  return `${base}-${headingIdCounter}`;
}

function resolveOverviewPane(target){
  if(!target) return null;
  if(target instanceof HTMLElement){
    return target.classList.contains('v2-overview') ? target : target.querySelector('.v2-overview');
  }
  if(target?.overview instanceof HTMLElement) return target.overview;
  return null;
}

function captureOverviewState(pane){
  if(!pane) return { expanded:false };
  const paragraph = pane.querySelector('.v2-overview-text');
  const toggle = pane.querySelector('.v2-overview-toggle');
  const expanded = Boolean(paragraph?.classList.contains('is-expanded'))
    || toggle?.getAttribute('aria-expanded') === 'true';
  return { expanded: Boolean(expanded) };
}

function createCard(title, key){
  const section = document.createElement('section');
  section.className = 'card';
  section.dataset.section = key;
  section.setAttribute('role', 'group');

  const headingId = nextHeadingId(key);
  const heading = document.createElement('h3');
  heading.className = 'card-title';
  heading.id = headingId;
  heading.textContent = title;

  section.setAttribute('aria-labelledby', headingId);

  const content = document.createElement('div');
  content.className = 'card-content';

  section.append(heading, content);
  return { section, content, heading };
}

function createFallback(text){
  const p = document.createElement('p');
  p.className = 'card-empty';
  p.textContent = text;
  return p;
}

function createPlotCard(item, previousState){
  const { section, content } = createCard('Handlung', 'plot');

  const tmdb = (item?.tmdbDetail?.overview || '').trim();
  const local = (item?.summary || item?.overview || '').trim();
  const overview = tmdb || local;

  if(!overview){
    content.append(createFallback('Keine Inhaltsangabe verfügbar.'));
    return { section };
  }

  const paragraphId = nextHeadingId('plot-text');
  const paragraph = document.createElement('p');
  paragraph.className = 'v2-overview-text line-clamp line-clamp-5';
  paragraph.id = paragraphId;
  paragraph.textContent = overview;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'v2-overview-toggle';
  toggle.setAttribute('aria-controls', paragraphId);

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
  if(badgeText){
    const badge = document.createElement('span');
    badge.className = 'v2-lang-badge';
    badge.textContent = badgeText;
    badge.setAttribute('aria-label', `Sprache: ${badgeText}`);
    content.appendChild(badge);
  }

  content.append(paragraph, toggle);

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

  const afterRender = ()=>{
    setExpanded(Boolean(previousState?.expanded));
    schedule(measure);
  };

  return { section, afterRender };
}

function genresFromItem(item){
  const arr = Array.isArray(item?.genres) ? item.genres : [];
  const tmdb = Array.isArray(item?.tmdbDetail?.genres) ? item.tmdbDetail.genres : [];
  const mapped = [...arr, ...tmdb].map(entry=>{
    if(!entry) return '';
    if(typeof entry === 'string') return entry;
    return entry.tag || entry.title || entry.name || '';
  }).filter(Boolean);
  return Array.from(new Set(mapped));
}

function createGenreCard(item){
  const { section, content } = createCard('Genres', 'genres');
  const genres = genresFromItem(item);

  if(genres.length){
    const chips = document.createElement('div');
    chips.className = 'v2-chip-group';
    genres.forEach(name=>{
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = name;
      chip.setAttribute('aria-label', `Genre: ${name}`);
      chips.appendChild(chip);
    });
    content.appendChild(chips);
  }else{
    content.append(createFallback('Keine Genres vorhanden.'));
  }

  return { section };
}

function watchProviderGroups(item){
  const detail = item?.tmdbDetail;
  if(!detail?.watchProviders) return [];
  const state = getState();
  const region = (state?.cfg?.iso || state?.cfg?.region || 'DE').toUpperCase();
  const source = detail.watchProviders?.[region] || detail.watchProviders?.DE || detail.watchProviders?.default || null;
  if(!source) return [];
  const map = [
    ['flatrate', 'Streaming'],
    ['rent', 'Leihen'],
    ['buy', 'Kaufen'],
    ['free', 'Kostenlos'],
    ['ads', 'Mit Werbung'],
  ];
  const groups = [];
  for(const [key, label] of map){
    const list = Array.isArray(source[key]) ? source[key] : [];
    const providers = list.map(entry => ({
      id: entry?.id || entry?.provider_id || entry?.providerId || '',
      name: entry?.provider_name || entry?.name || '',
      logo: entry?.logo || entry?.logo_path || entry?.logoPath || '',
    })).filter(entry => entry.name);
    if(providers.length){
      groups.push({ label, providers });
    }
  }
  return groups;
}

function createProviderCard(item){
  const { section, content } = createCard('Verfügbarkeit', 'providers');
  const providers = watchProviderGroups(item);

  if(providers.length){
    const groupsWrap = document.createElement('div');
    groupsWrap.className = 'v2-provider-groups';
    providers.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'v2-provider-group';
      const labelEl = document.createElement('p');
      labelEl.className = 'v2-provider-label';
      labelEl.textContent = group.label;
      const listEl = document.createElement('div');
      listEl.className = 'v2-provider-list';
      group.providers.forEach(provider => {
        const itemEl = document.createElement('span');
        itemEl.className = 'v2-provider';
        itemEl.setAttribute('data-provider', provider.id || provider.name);
        if(provider.logo){
          const logo = document.createElement('img');
          logo.src = provider.logo;
          logo.alt = provider.name;
          logo.loading = 'lazy';
          logo.decoding = 'async';
          itemEl.appendChild(logo);
        }
        const name = document.createElement('span');
        name.className = 'v2-provider-name';
        name.textContent = provider.name;
        itemEl.appendChild(name);
        listEl.appendChild(itemEl);
      });
      groupEl.append(labelEl, listEl);
      groupsWrap.appendChild(groupEl);
    });
    content.appendChild(groupsWrap);
  }else{
    content.append(createFallback('Keine Anbieterinformationen verfügbar.'));
  }

  return { section };
}

function collectLanguages(item){
  const entries = [];

  if(Array.isArray(item?.tmdbDetail?.spokenLanguages)){
    item.tmdbDetail.spokenLanguages.forEach(lang => {
      const name = String(lang?.name || '').trim();
      const code = String(lang?.code || lang?.iso6391 || lang?.iso_639_1 || '').trim();
      if(name || code){
        entries.push({ name, code, source: 'tmdb' });
      }
    });
  }

  const localCandidates = [];
  if(Array.isArray(item?.audioLanguages)) localCandidates.push(...item.audioLanguages);
  if(Array.isArray(item?.languages)) localCandidates.push(...item.languages);
  if(item?.audioLanguage) localCandidates.push(item.audioLanguage);
  if(item?.language) localCandidates.push(item.language);

  localCandidates.forEach(value => {
    const name = String(value || '').trim();
    if(name){
      entries.push({ name, code: '', source: 'local' });
    }
  });

  const seen = new Set();
  return entries.filter(entry => {
    const name = entry.name.toLowerCase();
    const code = entry.code.toLowerCase();
    const key = `${name}|${code}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(entry => ({
    name: entry.name,
    code: entry.code,
    source: entry.source,
  }));
}

function createLanguageCard(item){
  const { section, content } = createCard('Sprachen', 'languages');
  const languages = collectLanguages(item);

  if(languages.length){
    const chips = document.createElement('div');
    chips.className = 'v2-chip-group';
    languages.forEach(lang => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const labelParts = [];
      if(lang.name) labelParts.push(lang.name);
      const upperCode = lang.code ? lang.code.toUpperCase() : '';
      if(upperCode && (!lang.name || lang.name.toUpperCase() !== upperCode)){
        labelParts.push(upperCode);
      }
      const label = labelParts.join(' • ') || 'Unbekannte Sprache';
      chip.textContent = label;
      chip.setAttribute('aria-label', `Sprache: ${label}`);
      if(lang.source) chip.dataset.source = lang.source;
      chips.appendChild(chip);
    });
    content.appendChild(chips);
  }else{
    content.append(createFallback('Keine Sprachinformationen verfügbar.'));
  }

  return { section };
}

export function renderOverview(target, item){
  const pane = resolveOverviewPane(target);
  if(!pane) return;

  const previousState = captureOverviewState(pane);

  const plot = createPlotCard(item, previousState);
  const genres = createGenreCard(item);
  const providers = createProviderCard(item);
  const languages = createLanguageCard(item);

  const grid = document.createElement('div');
  grid.className = 'grid-2';
  grid.append(plot.section, genres.section, providers.section, languages.section);

  pane.replaceChildren(grid);

  [plot.afterRender, genres.afterRender, providers.afterRender, languages.afterRender]
    .filter(Boolean)
    .forEach(cb => cb());
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
