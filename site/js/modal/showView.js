import { qs } from '../dom.js';
import { renderSeasonsAccordion } from './seasonsAccordion.js';
import { renderChipsLimited } from '../utils.js';

export function renderShowView(item){
  const ov = qs('#mOverviewShow');
  if(ov){ ov.hidden = false; ov.textContent = item.overview || item.summary || ''; }
  const kpi = qs('#mKpiShow');
  if(kpi){
    kpi.hidden = false;
    const chips = [];
    if(item.runtimeMin) chips.push(`~${item.runtimeMin} min/Ep`);
    if(item.seasonCount) chips.push(`Staffeln: ${item.seasonCount}`);
    kpi.replaceChildren(...chips.map(t=>{ const s=document.createElement('span'); s.className='chip'; s.textContent=t; return s; }));
  }
  const cast = (item.cast||item.roles||[]).map(x=>x && (x.tag||x.role||x.name)).filter(Boolean);
  const castEl = qs('#mCastShow');
  if(castEl){ castEl.hidden=false; renderChipsLimited(castEl, cast, 6); }
  const seasonsAccordion = document.getElementById('seasonsAccordion');
  if(seasonsAccordion){ seasonsAccordion.hidden = false; }
  renderSeasonsAccordion(item.seasons || []);

  const movieOv = qs('#mOverview');
  if(movieOv){ movieOv.hidden = true; movieOv.textContent = ''; }
  const movieCast = qs('#mCast');
  if(movieCast){ movieCast.hidden = true; movieCast.replaceChildren(); }
}
