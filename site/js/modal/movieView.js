import { qs } from '../dom.js';
import { renderChipsLimited } from '../utils.js';

export function renderMovieView(item){
  const ov = qs('#mOverview');
  if(ov){
    ov.hidden = false;
    ov.textContent = item.overview || item.summary || '';
  }
  const cast = (item.cast||item.roles||[]).map(x=>x && (x.tag||x.role||x.name)).filter(Boolean);
  const castEl = qs('#mCast');
  if(castEl){
    castEl.hidden = false;
    renderChipsLimited(castEl, cast, 6);
  }

  const ovShow = qs('#mOverviewShow');
  if(ovShow){
    ovShow.hidden = true;
    ovShow.textContent = '';
  }
  const kpiShow = qs('#mKpiShow');
  if(kpiShow){
    kpiShow.hidden = true;
    kpiShow.replaceChildren();
  }
  const castShow = qs('#mCastShow');
  if(castShow){
    castShow.hidden = true;
    castShow.replaceChildren();
  }
  const seasonsAccordion = document.getElementById('seasonsAccordion');
  if(seasonsAccordion){
    seasonsAccordion.hidden = true;
    seasonsAccordion.replaceChildren();
  }
}
