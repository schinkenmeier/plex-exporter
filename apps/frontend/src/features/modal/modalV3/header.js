import { formatRating } from '../../../js/utils.js';
import { prefixThumbValue } from '../../../js/data.js';
import { runtimeText, ratingText, studioText } from './formatting.js';

function normalizeThumbnailUrl(url, type){
  if(!url) return '';
  const str = String(url).trim();
  if(!str) return '';
  if(/^data:/i.test(str)) return str;

  const normalizedType = type === 'show' ? 'series' : type;

  if(/^https?:\/\//i.test(str)){
    try{
      const parsed = new URL(str, (typeof window !== 'undefined' && window.location?.origin) || 'http://localhost');
      if(parsed.pathname.startsWith('/api/thumbnails/')){
        const rest = parsed.pathname.replace(/^\/api\/thumbnails\/?/, '');
        const rebuilt = prefixThumbValue(rest, normalizedType === 'series' ? 'series' : 'movies');
        if(rebuilt){
          if(/^https?:\/\//i.test(rebuilt)){
            return rebuilt;
          }
          parsed.pathname = rebuilt;
          return parsed.toString();
        }
      }
      return parsed.toString();
    }catch(err){
      console.warn('[modal] Failed to normalize absolute thumbnail URL:', err?.message || err);
    }
  }

  if(str.startsWith('//')) return `https:${str}`;

  const rebuilt = prefixThumbValue(str, normalizedType === 'series' ? 'series' : 'movies');
  if(rebuilt) return rebuilt;

  return str;
}

function sanitizeUrl(url){
  if(!url) return '';
  const str = String(url).trim();
  if(!str) return '';
  if(/^https?:\/\//i.test(str) || /^data:image\//i.test(str)) return str;
  if(str.startsWith('//')) return `https:${str}`;
  if(str.startsWith('data/')) return str;
  return str.replace(/["'()]/g, '');
}

function logoEntryToUrl(entry){
  if(!entry) return '';
  if(typeof entry === 'string') return entry;
  return (
    entry.url ||
    entry.file_path ||
    entry.filePath ||
    entry.path ||
    entry.logo ||
    entry.logoPath ||
    entry.poster ||
    entry.backdrop ||
    ''
  );
}

function logoEntryLanguage(entry){
  if(!entry || typeof entry !== 'object') return '';
  const lang = entry.iso6391 || entry.iso_639_1 || entry.language || '';
  return typeof lang === 'string' ? lang.toLowerCase() : '';
}

function resolveBaseItem(viewModel){
  if(!viewModel) return null;
  const item = viewModel.item || {};
  const type = viewModel.kind === 'show' ? 'tv' : item.type;
  return { ...item, type };
}

function deriveMeta(viewModel){
  const baseItem = resolveBaseItem(viewModel);
  const runtime = viewModel?.meta?.runtime || (baseItem ? runtimeText(baseItem) : '');
  const rating = viewModel?.meta?.rating || (baseItem ? ratingText(baseItem) : '');
  const studio = viewModel?.meta?.studio || (baseItem ? studioText(baseItem) : '');
  const contentRating = viewModel?.meta?.contentRating || '';
  const seasonCount = viewModel?.meta?.seasonCount ?? null;
  return { runtime, rating, studio, contentRating, seasonCount };
}

function resolveDetail(viewModel){
  if(!viewModel) return null;
  return viewModel.item || null;
}

function pickHeroLogo(viewModel){
  const item = viewModel?.item || {};
  const logos = [];
  const collect = list => {
    if(!Array.isArray(list)) return;
    for(const entry of list){
      const url = sanitizeUrl(logoEntryToUrl(entry));
      if(url) logos.push({ entry, url });
    }
  };
  collect(item.logos);
  collect(item.images?.logos);
  if(!logos.length) return '';
  const preferences = ['de', 'en', ''];
  for(const pref of preferences){
    const match = logos.find(({ entry }) => {
      const lang = logoEntryLanguage(entry);
      if(pref){ return lang === pref; }
      return !lang;
    });
    if(match?.url) return match.url;
  }
  return logos[0]?.url || '';
}

function pickLogo(viewModel, excludeUrl=''){
  const candidates = [];
  const seen = new Set();
  const exclude = sanitizeUrl(excludeUrl);
  if(exclude) seen.add(exclude);
  const push = value => {
    const url = sanitizeUrl(logoEntryToUrl(value));
    if(!url || seen.has(url)) return;
    seen.add(url);
    candidates.push(url);
  };
  const item = viewModel?.item || {};
  if(Array.isArray(item.logos)) item.logos.forEach(push);
  if(Array.isArray(item.images?.logos)) item.images.logos.forEach(push);
  if(Array.isArray(item.networks)) item.networks.forEach(push);
  if(Array.isArray(item.productionCompanies)) item.productionCompanies.forEach(push);
  return candidates[0] || '';
}

function ratingBucket(value){
  if(!Number.isFinite(value)) return '';
  if(value >= 7.5) return 'high';
  if(value >= 5.5) return 'medium';
  if(value > 0) return 'low';
  return '';
}

function pickHeroRating(viewModel){
  if(!viewModel) return null;
  const fallback = Number(
    viewModel.item?.rating ??
    viewModel.item?.audienceRating ??
    viewModel.item?.userRating ??
    viewModel.item?.ratingKey
  );
  if(Number.isFinite(fallback) && fallback > 0){
    return {
      label: 'Bewertung',
      text: formatRating(fallback),
      value: fallback,
      bucket: ratingBucket(fallback),
    };
  }
  return null;
}

function clearElement(element){
  if(!element) return;
  element.replaceChildren();
}

function ensureElement(tag, className){
  if(typeof document === 'undefined') return null;
  const el = document.createElement(tag);
  if(className) el.className = className;
  return el;
}

function createHeadStructure(){
  const root = ensureElement('header', 'v3-head');
  if(!root) return null;

  const actions = ensureElement('div', 'v3-head__actions');
  const closeButton = ensureElement('button', 'v3-head__close');
  if(actions && closeButton){
    closeButton.id = 'action-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Schließen');
    const icon = ensureElement('span', 'v3-head__close-icon');
    if(icon){
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '×';
      closeButton.append(icon);
    }
    closeButton.hidden = false;
    closeButton.removeAttribute('hidden');
    actions.append(closeButton);
  }

  const visual = ensureElement('div', 'v3-head__visual');
  visual.dataset.v3HeadVisual = '1';
  const hero = ensureElement('div', 'v3-head__hero');
  hero.dataset.v3HeadHero = '1';
  const backdrop = ensureElement('div', 'v3-head__backdrop');
  backdrop.dataset.v3HeadBackdrop = '1';
  const overlayLogo = ensureElement('div', 'v3-head__overlay-logo');
  overlayLogo.dataset.v3HeadOverlayLogo = '1';
  overlayLogo.hidden = true;
  const overlayMeta = ensureElement('div', 'v3-head__overlay-meta');
  overlayMeta.dataset.v3HeadOverlayMeta = '1';
  overlayMeta.hidden = true;
  hero.append(backdrop, overlayLogo, overlayMeta);

  const layout = ensureElement('div', 'v3-head__layout');
  const posterSlot = ensureElement('div', 'v3-head__poster-slot');
  posterSlot.dataset.v3HeadPosterSlot = '1';

  const content = ensureElement('div', 'v3-head__content');
  const status = ensureElement('p', 'v3-head__status');
  status.dataset.v3HeadStatus = '1';
  status.hidden = true;
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  const titlebar = ensureElement('div', 'v3-head__titlebar');
  const titlewrap = ensureElement('div', 'v3-head__titlewrap');
  const badges = ensureElement('div', 'v3-badges');
  badges.dataset.v3HeadBadges = '1';
  badges.hidden = true;
  const title = ensureElement('h1', 'v3-title');
  title.dataset.v3HeadTitle = '1';
  const subtitle = ensureElement('p', 'v3-subtitle');
  subtitle.dataset.v3HeadSubtitle = '1';
  subtitle.hidden = true;
  const meta = ensureElement('p', 'v3-submeta');
  meta.dataset.v3HeadMeta = '1';
  meta.hidden = true;
  titlewrap.append(badges, title, subtitle, meta);
  titlebar.append(titlewrap);

  const logoSlot = ensureElement('div', 'v3-head__logo');
  logoSlot.dataset.v3HeadLogo = '1';
  logoSlot.hidden = true;

  content.append(status, titlebar, logoSlot);
  layout.append(posterSlot, content);
  visual.append(hero, layout);

  if(actions && actions.childElementCount) root.append(actions);
  root.append(visual);
  return root;
}

function createPosterStructure(){
  const root = ensureElement('div', 'v3-poster-card');
  if(!root) return null;
  const media = ensureElement('div', 'v3-poster-media');
  media.dataset.v3PosterMedia = '1';
  media.dataset.state = 'empty';
  const skeleton = ensureElement('div', 'v3-poster-skeleton');
  skeleton.dataset.v3PosterSkeleton = '1';
  skeleton.setAttribute('aria-hidden', 'true');
  const img = ensureElement('img', '');
  img.dataset.v3PosterImage = '1';
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  media.append(skeleton, img);
  root.append(media);
  return root;
}

function createHeadRefs(root){
  if(!root) return null;
  return {
    root,
    elements: {
      heroBackdrop: root.querySelector('[data-v3-head-backdrop]'),
      overlayLogo: root.querySelector('[data-v3-head-overlay-logo]'),
      overlayMeta: root.querySelector('[data-v3-head-overlay-meta]'),
      posterSlot: root.querySelector('[data-v3-head-poster-slot]'),
      logo: root.querySelector('[data-v3-head-logo]'),
      status: root.querySelector('[data-v3-head-status]'),
      badges: root.querySelector('[data-v3-head-badges]'),
      title: root.querySelector('[data-v3-head-title]'),
      subtitle: root.querySelector('[data-v3-head-subtitle]'),
      meta: root.querySelector('[data-v3-head-meta]'),
      close: root.querySelector('#action-close'),
    },
  };
}

function createPosterRefs(root){
  if(!root) return null;
  const media = root.querySelector('[data-v3-poster-media]');
  return {
    root,
    media,
    img: media?.querySelector('[data-v3-poster-image]') || media?.querySelector('img'),
    skeleton: media?.querySelector('[data-v3-poster-skeleton]') || null,
  };
}

function coerceHeadTarget(target){
  if(!target) return null;
  if(target.root && target.elements) return target;
  if(target.root){
    const refs = createHeadRefs(target.root);
    return refs ? { ...refs } : null;
  }
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(elementCtor && target instanceof elementCtor){
    return createHeadRefs(target);
  }
  return null;
}

function coercePosterTarget(target){
  if(!target) return null;
  if(target.root && target.media) return target;
  if(target.root){
    const refs = createPosterRefs(target.root);
    return refs ? { ...refs } : null;
  }
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(elementCtor && target instanceof elementCtor){
    return createPosterRefs(target);
  }
  return null;
}

function resetBackdrop(backdrop){
  if(!backdrop) return;
  backdrop.style.backgroundImage = '';
  if(backdrop.dataset){
    backdrop.dataset.state = '';
    backdrop.dataset.src = '';
    backdrop.dataset.source = '';
  }
}

function applyBackdrop(backdrop, viewModel){
  if(!backdrop) return;
  const source = viewModel?.backdrop?.source || '';
  const type = viewModel?.kind === 'show' ? 'series' : 'movies';
  const rawUrl = viewModel?.backdrop?.url || viewModel?.item?.art || viewModel?.item?.background || '';
  const normalized = normalizeThumbnailUrl(rawUrl, type) || rawUrl;
  const sanitized = sanitizeUrl(normalized);
  if(backdrop.dataset) backdrop.dataset.source = source || '';
  if(!sanitized){
    resetBackdrop(backdrop);
    return;
  }
  if(typeof Image === 'undefined'){
    backdrop.style.backgroundImage = `url("${sanitized}")`;
    if(backdrop.dataset){
      backdrop.dataset.state = 'ready';
      backdrop.dataset.src = sanitized;
    }
    return;
  }
  if(backdrop.dataset?.src === sanitized && backdrop.dataset?.state === 'ready'){
    return;
  }
  if(backdrop.dataset){
    backdrop.dataset.state = 'loading';
    backdrop.dataset.src = sanitized;
  }
  backdrop.style.backgroundImage = '';
  const img = new Image();
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('load', () => {
    if(backdrop.dataset?.src !== sanitized) return;
    backdrop.style.backgroundImage = `url("${sanitized}")`;
    if(backdrop.dataset) backdrop.dataset.state = 'ready';
  }, { once: true });
  img.addEventListener('error', () => {
    if(backdrop.dataset?.src !== sanitized) return;
    resetBackdrop(backdrop);
  }, { once: true });
  img.src = sanitized;
}

function applyHeroLogo(slot, viewModel, onError){
  if(!slot) return '';
  const logoUrl = sanitizeUrl(pickHeroLogo(viewModel));
  slot.dataset.src = '';
  if(!logoUrl){
    slot.hidden = true;
    slot.dataset.state = '';
    clearElement(slot);
    return '';
  }
  const img = ensureElement('img', 'v3-head__overlay-image');
  img.alt = viewModel?.title ? `Hero Logo: ${viewModel.title}` : 'Hero Logo';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  clearElement(slot);
  slot.appendChild(img);
  slot.dataset.src = logoUrl;
  if(typeof Image === 'undefined'){
    img.src = logoUrl;
    slot.hidden = false;
    slot.dataset.state = 'ready';
    return logoUrl;
  }
  slot.hidden = true;
  slot.dataset.state = 'loading';
  img.addEventListener('load', () => {
    if(slot.dataset?.src !== logoUrl) return;
    slot.hidden = false;
    slot.dataset.state = 'ready';
  }, { once: true });
  img.addEventListener('error', () => {
    if(slot.dataset?.src !== logoUrl) return;
    slot.hidden = true;
    slot.dataset.state = '';
    slot.dataset.src = '';
    clearElement(slot);
    if(typeof onError === 'function') onError();
  }, { once: true });
  img.src = logoUrl;
  return logoUrl;
}

function applyLogo(slot, viewModel, excludeUrl=''){
  if(!slot) return;
  const logoUrl = sanitizeUrl(pickLogo(viewModel, excludeUrl));
  if(!logoUrl){
    slot.hidden = true;
    clearElement(slot);
    return;
  }
  let img = slot.querySelector('img');
  if(!img){
    img = ensureElement('img', 'v3-head__logo-image');
    slot.replaceChildren(img);
  }
  img.alt = viewModel?.title ? `Logo: ${viewModel.title}` : 'Logo';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.src = logoUrl;
  slot.hidden = false;
}

function applyHeroMeta(slot, viewModel){
  if(!slot) return;
  clearElement(slot);
  const ratingInfo = pickHeroRating(viewModel);
  if(!ratingInfo){
    slot.hidden = true;
    slot.dataset.state = '';
    return;
  }
  const chip = ensureElement('span', 'v3-head__rating-chip');
  if(ratingInfo.bucket) chip.dataset.score = ratingInfo.bucket;
  const label = ensureElement('span', 'v3-head__rating-label');
  label.textContent = ratingInfo.label;
  const value = ensureElement('strong', 'v3-head__rating-value');
  value.textContent = ratingInfo.text;
  chip.append(label, value);
  chip.setAttribute('aria-label', `${ratingInfo.label} Bewertung ${ratingInfo.text} von 10`);
  slot.appendChild(chip);
  slot.hidden = false;
  slot.dataset.state = 'ready';
}

function renderTitleSection(target, viewModel){
  const head = coerceHeadTarget(target);
  if(!head) return;
  const { title, subtitle, meta } = head.elements;
  const derivedMeta = deriveMeta(viewModel);
  if(title) title.textContent = viewModel?.title || '';
  const tagline = viewModel?.tagline || '';
  const metaParts = [];
  if(viewModel?.year) metaParts.push(viewModel.year);
  if(derivedMeta.runtime) metaParts.push(derivedMeta.runtime);
  const rating = derivedMeta.rating;
  if(rating) metaParts.push(rating);
  const studio = derivedMeta.studio;
  if(studio) metaParts.push(studio);
  const fallback = metaParts.join(' • ');
  if(subtitle){
    const text = tagline || fallback;
    subtitle.textContent = text;
    subtitle.hidden = !text;
  }
  if(meta){
    const metaText = tagline && fallback ? fallback : '';
    meta.textContent = metaText;
    meta.hidden = !metaText;
  }
}

function renderBadgesSection(target, badges){
  const head = coerceHeadTarget(target);
  if(!head) return;
  const container = head.elements.badges;
  if(!container) return;
  clearElement(container);
  const entries = Array.isArray(badges) ? badges.filter(Boolean) : [];
  entries.forEach(entry => {
    const badge = ensureElement('span', 'v3-badge');
    badge.dataset.source = entry.source || '';
    const label = ensureElement('span', 'v3-badge__label');
    label.textContent = entry.label || '';
    const value = ensureElement('strong', 'v3-badge__value');
    value.textContent = entry.text || '';
    badge.append(label, value);
    badge.setAttribute('aria-label', `${entry.label || 'Badge'}: ${entry.text || ''}`);
    container.appendChild(badge);
  });
  container.hidden = !container.childElementCount;
}

function renderHeroSection(target, viewModel){
  const head = coerceHeadTarget(target);
  if(!head) return;
  const { heroBackdrop, overlayLogo, overlayMeta, logo } = head.elements;
  applyBackdrop(heroBackdrop, viewModel);
  const heroLogo = applyHeroLogo(overlayLogo, viewModel, () => applyLogo(logo, viewModel, ''));
  applyHeroMeta(overlayMeta, viewModel);
  applyLogo(logo, viewModel, heroLogo);
}

function setPosterState(target, state){
  if(!target) return;
  if(target.dataset) target.dataset.state = state || '';
}

function renderPoster(target, viewModel){
  const poster = coercePosterTarget(target);
  if(!poster || !poster.media) return;
  const { media } = poster;
  const source = viewModel?.poster?.source || '';
  if(media.dataset) media.dataset.source = source || '';
  const url = sanitizeUrl(viewModel?.poster?.url);
  const currentUrl = url || '';
  const title = viewModel?.title || viewModel?.item?.title || '';
  const altText = viewModel?.poster?.alt || (title ? `Poster: ${title}` : 'Poster');
  const newImg = ensureElement('img', '');
  newImg.dataset.v3PosterImage = '1';
  newImg.dataset.posterUrl = currentUrl;
  newImg.alt = altText;
  newImg.loading = 'lazy';
  newImg.decoding = 'async';
  newImg.referrerPolicy = 'no-referrer';
  newImg.className = poster.img?.className || '';
  newImg.classList.remove('is-ready');
  media.querySelectorAll('[data-v3-poster-image]').forEach(node => {
    if(node !== newImg) node.remove();
  });
  const skeleton = poster.skeleton;
  if(media.dataset) media.dataset.posterUrl = currentUrl;
  if(url){
    setPosterState(media, 'loading');
    newImg.addEventListener('load', () => {
      if(media.dataset?.posterUrl !== currentUrl || newImg.dataset.posterUrl !== currentUrl) return;
      newImg.classList.add('is-ready');
      setPosterState(media, 'ready');
    }, { once: true });
    newImg.addEventListener('error', () => {
      if(media.dataset?.posterUrl !== currentUrl || newImg.dataset.posterUrl !== currentUrl) return;
      newImg.classList.add('is-ready');
      setPosterState(media, 'error');
    }, { once: true });
    newImg.src = url;
  }else{
    newImg.classList.add('is-ready');
    setPosterState(media, 'empty');
  }
  if(skeleton && !media.contains(skeleton)) media.prepend(skeleton);
  media.appendChild(newImg);
  poster.img = newImg;
}

function renderQuickfactsSection(target, viewModel){
  // Quickfacts intentionally removed from modal header.
}

export function createHead(viewModel = null){
  const root = createHeadStructure();
  if(!root) return null;
  const refs = createHeadRefs(root);
  if(viewModel) renderHead(refs, viewModel);
  return refs;
}

export function createPosterCard(viewModel = null){
  const root = createPosterStructure();
  if(!root) return null;
  const refs = createPosterRefs(root);
  if(viewModel){
    renderPoster(refs, viewModel);
  }
  return refs;
}

export function renderHead(target, viewModel){
  const head = coerceHeadTarget(target);
  if(!head) return null;
  renderHeroSection(head, viewModel);
  renderTitleSection(head, viewModel);
  renderBadgesSection(head, viewModel?.badges || []);
  setHeadStatus(head, null);
  return head;
}

export function renderPosterCard(target, viewModel){
  renderPoster(target, viewModel);
}

export function renderBackdropHero(target, viewModel){
  renderHeroSection(target, viewModel);
}

export function renderTitle(target, viewModel){
  renderTitleSection(target, viewModel);
}

export function renderBadges(target, badges){
  renderBadgesSection(target, badges);
}

export function renderQuickfacts(target, viewModel){
  renderQuickfactsSection(target, viewModel);
}

export function setHeadStatus(target, payload){
  const head = coerceHeadTarget(target);
  const statusEl = head?.elements?.status;
  if(!statusEl) return;
  if(!payload){
    statusEl.hidden = true;
    statusEl.textContent = '';
    if(statusEl.dataset) statusEl.dataset.state = '';
    statusEl.setAttribute('aria-hidden', 'true');
    return;
  }
  const message = payload.message ? String(payload.message).trim() : '';
  const state = payload.state ? String(payload.state).trim() : '';
  statusEl.textContent = message;
  if(statusEl.dataset) statusEl.dataset.state = state;
  const hasMessage = Boolean(message);
  statusEl.hidden = !hasMessage;
  statusEl.setAttribute('aria-hidden', hasMessage ? 'false' : 'true');
}

export function getHeadRoot(target){
  const head = coerceHeadTarget(target);
  return head?.root || null;
}

export function getPosterRoot(target){
  const poster = coercePosterTarget(target);
  return poster?.root || null;
}
