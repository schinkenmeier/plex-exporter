import { renderSeasonsAccordion } from './seasonsAccordion.js';

export function updateSeasons(root, item){
  const pane = root.querySelector('.v2-seasons');
  if(!pane) return;
  const seasons = Array.isArray(item?.seasons) ? item.seasons : [];
  if(!seasons.length){
    pane.innerHTML = '<p class="modalv2-loading">Keine Staffel-Informationen verfügbar.</p>';
    return;
  }
  pane.innerHTML = '';
  renderSeasonsAccordion(pane, seasons, { show: item });
}
