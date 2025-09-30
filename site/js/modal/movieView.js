import { qs } from '../dom.js';
import { renderChipsLimited } from '../utils.js';

export function renderMovieView(item){
  const ov = qs('#mOverview');
  if(ov) ov.textContent = item.overview || item.summary || '';
  const cast = (item.cast||item.roles||[]).map(x=>x && (x.tag||x.role||x.name)).filter(Boolean);
  const castEl = qs('#mCast');
  if(castEl){ renderChipsLimited(castEl, cast, 6); }
}
