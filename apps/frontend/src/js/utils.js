import { getState } from '../core/state.js';
import { collectionTags as sharedCollectionTags, getGenreNames as sharedGetGenreNames, humanYear as sharedHumanYear } from '@plex-exporter/shared';

const LOG_PREFIX = '[utils]';

export function getGenreNames(genres){
  return sharedGetGenreNames(genres);
}

export function renderChipsLimited(container, values, limit=3){
  if(!container) return;
  const vals = (values||[]).filter(Boolean);

  // If we have more values than the limit, show limit chips + aggregator
  if(vals.length > limit){
    const head = vals.slice(0, limit);
    const rest = vals.slice(limit);
    const chips = head.map(text=>chip(text));

    const more = chip(`+ ${rest.length}`);
    more.classList.add('more', 'card__chip--more');
    more.setAttribute('data-more', rest.length);
    more.setAttribute('title', `${rest.length} weitere Genres: ${rest.join(', ')}`);
    // store extra chips to reveal on click
    more._extraChips = rest.map(text=>chip(text));
    chips.push(more);

    container.replaceChildren(...chips);
  } else {
    // Show all chips if we have limit or fewer
    const chips = vals.map(text=>chip(text));
    container.replaceChildren(...chips);
  }

  enableMoreChipBehavior(container);
}

export function enableMoreChipBehavior(root = document){
  try{
    root.querySelectorAll('.chip.more, .card__chip--more').forEach(btn=>{
      if(btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', (e)=>{
        // Stop propagation to prevent card click from opening modal
        e.stopPropagation();

        // Find the parent card element
        const card = btn.closest('.card');
        if(card) {
          // Trigger the card's click event to open the modal
          card.click();
        } else {
          // Fallback: expand inline if not in a card context
          const hidden = btn._extraChips || [];
          try{
            hidden.forEach(ch => btn.before(ch));
          }catch(err){
            console.warn(`${LOG_PREFIX} Failed to expand inline chips:`, err);
          }
          btn.remove();
        }
      });
    });
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to enable more chip behaviour:`, err);
  }
}

export function collectionTags(item){
  return sharedCollectionTags(item);
}

export function humanYear(item){
  return sharedHumanYear(item);
}

export function formatRating(val){
  if(val instanceof Number){
    return formatRating(val.valueOf());
  }

  if(typeof val === 'number'){
    return Number.isFinite(val) ? val.toFixed(1) : '0.0';
  }

  if(typeof val === 'string'){
    const trimmed = val.trim();
    if(!trimmed) return '0.0';
    const num = Number(trimmed);
    return Number.isFinite(num) ? num.toFixed(1) : '0.0';
  }

  return '0.0';
}

function chip(text){ const s=document.createElement('span'); s.className='chip'; s.textContent=String(text||''); return s; }

export function isNew(item){
  if(!item?.addedAt) return false;
  const added = new Date(item.addedAt).getTime();
  if(!Number.isFinite(added)) return false;
  const cfg = getState().cfg || {};
  const days = Number(cfg.newDays || 30);
  return Date.now() - added <= days * 24*60*60*1000;
}

/**
 * Check if TMDB credentials are available
 * @returns {boolean}
 */
function hasTmdbCredentials(){
  try{
    const token = localStorage.getItem('tmdbToken');
    if(token && token.trim()) return true;
    const state = getState();
    if(state.cfg?.tmdbToken || state.cfg?.tmdbApiKey) return true;
    return false;
  }catch(err){
    console.warn(`${LOG_PREFIX} Unable to check TMDB credentials:`, err);
    return false;
  }
}

/**
 * Check if TMDB images should be used for grid cards
 * User-controlled toggle (default: off)
 * @returns {boolean}
 */
export function useTmdbForCards(){
  try{
    return localStorage.getItem('useTmdb')==='1';
  }catch(err){
    console.warn(`${LOG_PREFIX} Unable to read TMDB card preference from storage:`, err);
    return false;
  }
}

/**
 * Check if TMDB should be used for Hero banner
 * Always enabled when credentials are available
 * @returns {boolean}
 */
export function useTmdbForHero(){
  return hasTmdbCredentials();
}

/**
 * Legacy alias for backwards compatibility
 * @deprecated Use useTmdbForCards() instead
 */
export function useTmdbOn(){
  return useTmdbForCards();
}

/**
 * Safely clear hero cache while preserving user settings
 * @returns {Object} Summary of cleared items
 */
export function clearHeroCache(){
  try{
    // Backup important user data
    const backup = {
      tmdbToken: localStorage.getItem('tmdbToken'),
      useTmdb: localStorage.getItem('useTmdb'),
      prefReduceMotion: localStorage.getItem('prefReduceMotion'),
      watchlist: localStorage.getItem('watchlist:v1'),
      modalLayout: localStorage.getItem('modalLayout'),
      scrollOrchestratorEnabled: localStorage.getItem('scrollOrchestratorEnabled')
    };

    // Count items before clearing
    const heroKeys = Object.keys(localStorage).filter(k =>
      k.startsWith('hero') || k.startsWith('Hero')
    );
    const tmdbCacheKeys = Object.keys(localStorage).filter(k =>
      k.includes('tmdbCache') || k === 'hero.tmdbCache.v1'
    );

    // Clear hero-related data
    heroKeys.forEach(key => localStorage.removeItem(key));
    tmdbCacheKeys.forEach(key => localStorage.removeItem(key));

    // Restore user settings
    Object.entries(backup).forEach(([key, value]) => {
      if(value !== null) localStorage.setItem(key, value);
    });

    console.log(`${LOG_PREFIX} Cleared ${heroKeys.length} hero entries and ${tmdbCacheKeys.length} TMDB cache entries`);

    return {
      heroEntries: heroKeys.length,
      tmdbCacheEntries: tmdbCacheKeys.length,
      preserved: Object.keys(backup).filter(k => backup[k] !== null)
    };
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to clear hero cache:`, err);
    return { error: err.message };
  }
}
