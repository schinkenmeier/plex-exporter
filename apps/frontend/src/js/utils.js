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
