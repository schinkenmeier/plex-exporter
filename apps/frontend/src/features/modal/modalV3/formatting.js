import { formatRating } from '../../../js/utils.js';

/**
 * Build a human readable runtime string for movies and shows.
 * @param {object} item
 * @returns {string}
 */
export function runtimeText(item){
  const sources = [
    item?.runtimeMin,
    item?.durationMin,
    item?.tmdbDetail?.runtime,
    item?.duration ? Math.round(Number(item.duration) / 60000) : null,
  ];

  let minutes = null;
  for(const value of sources){
    const parsed = Number(value);
    if(Number.isFinite(parsed) && parsed > 0){
      minutes = parsed;
      break;
    }
  }

  if(minutes === null) return '';
  if(item?.type === 'tv'){ return `~${minutes} min/Ep`; }
  return `${minutes} min`;
}

/**
 * Format rating text with a leading star.
 * @param {object} item
 * @returns {string}
 */
export function ratingText(item){
  const rating = Number(item?.rating ?? item?.audienceRating);
  if(!Number.isFinite(rating)) return '';
  return `★ ${formatRating(rating)}`;
}

/**
 * Resolve the studio/network label.
 * @param {object} item
 * @returns {string}
 */
export function studioText(item){
  if(item?.studio) return item.studio;
  if(item?.network) return item.network;
  if(item?.studioName) return item.studioName;
  if(item?.tmdbDetail?.productionCompanies){
    const first = item.tmdbDetail.productionCompanies.find(company => company?.name);
    if(first && first.name) return first.name;
  }
  if(item?.tmdbDetail?.networks){
    const net = item.tmdbDetail.networks.find(entry => entry?.name);
    if(net && net.name) return net.name;
  }
  return '';
}
