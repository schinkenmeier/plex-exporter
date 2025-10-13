const DEFAULT_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const DEFAULT_SIZES = {
  poster: 'w500',
  backdrop: 'w780',
  profile: 'h632',
  logo: 'w500',
  episode: 'w780',
};

function normaliseBase(base){
  const raw = String(base || DEFAULT_IMAGE_BASE).trim();
  if(!raw) return DEFAULT_IMAGE_BASE;
  return raw.replace(/\/$/, '');
}

function ensurePath(path){
  if(!path) return '';
  const str = String(path);
  if(!str) return '';
  return str.startsWith('/') ? str : `/${str}`;
}

function buildUrl(path, size, base){
  const cleaned = ensurePath(path);
  if(!cleaned) return '';
  const root = normaliseBase(base);
  return `${root}/${size}${cleaned}`;
}

function encodeSvg(svg){
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function pickBackground(type){
  switch(type){
    case 'poster':
      return '#1f2933';
    case 'profile':
      return '#111827';
    case 'logo':
      return '#0f172a';
    case 'episode':
      return '#0b1120';
    default:
      return '#101827';
  }
}

function pickForeground(type){
  return type === 'logo' ? '#e5e7eb' : '#f9fafb';
}

export function makeInitials(text, limit = 2){
  const str = String(text || '').trim();
  if(!str){
    return '';
  }
  const parts = str.split(/\s+/u).filter(Boolean);
  if(!parts.length){
    return str.slice(0, limit).toUpperCase();
  }
  const selected = parts.slice(0, limit).map(part => part.charAt(0));
  return selected.join('').toUpperCase();
}

function fallbackSvg({
  type,
  text = '',
  width,
  height,
  fontSize,
  fontWeight = '600',
  radius = 0,
}){
  const background = pickBackground(type);
  const foreground = pickForeground(type);
  const content = makeInitials(text, 2) || '∅';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${background}"/>\n  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="${foreground}" font-family="'Inter', 'Segoe UI', sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" letter-spacing="0.08em">${content}</text>\n</svg>`;
  return encodeSvg(svg);
}

function fallbackPoster(title){
  return fallbackSvg({ type: 'poster', text: title, width: 500, height: 750, fontSize: 140, radius: 24 });
}

function fallbackBackdrop(title){
  return fallbackSvg({ type: 'backdrop', text: title, width: 780, height: 439, fontSize: 120, radius: 16 });
}

function fallbackProfile(name){
  return fallbackSvg({ type: 'profile', text: name, width: 400, height: 600, fontSize: 140, radius: 32 });
}

function fallbackLogo(title){
  return fallbackSvg({ type: 'logo', text: title, width: 500, height: 281, fontSize: 96, radius: 24 });
}

function fallbackEpisode(title){
  return fallbackSvg({ type: 'episode', text: title, width: 780, height: 439, fontSize: 110, radius: 24 });
}

function normaliseOptions(options){
  return {
    imageBase: options?.imageBase ?? options?.base ?? DEFAULT_IMAGE_BASE,
    title: options?.title ?? options?.fallbackTitle ?? '',
    size: options?.size,
  };
}

export function urlPoster(path, options = {}){
  const { imageBase, title, size } = normaliseOptions(options);
  const candidate = buildUrl(path, size || DEFAULT_SIZES.poster, imageBase);
  return candidate || fallbackPoster(title);
}

export function urlBackdrop(path, options = {}){
  const { imageBase, title, size } = normaliseOptions(options);
  const candidate = buildUrl(path, size || DEFAULT_SIZES.backdrop, imageBase);
  return candidate || fallbackBackdrop(title);
}

export function urlProfile(path, options = {}){
  const { imageBase, title, size } = normaliseOptions(options);
  const candidate = buildUrl(path, size || DEFAULT_SIZES.profile, imageBase);
  return candidate || fallbackProfile(title);
}

export function urlLogo(path, options = {}){
  const { imageBase, title, size } = normaliseOptions(options);
  const candidate = buildUrl(path, size || DEFAULT_SIZES.logo, imageBase);
  return candidate || fallbackLogo(title);
}

export function urlEpisode(path, options = {}){
  const { imageBase, title, size } = normaliseOptions(options);
  const candidate = buildUrl(path, size || DEFAULT_SIZES.episode, imageBase);
  return candidate || fallbackEpisode(title);
}

export function buildFallbackPoster(title){
  return fallbackPoster(title);
}

export function buildFallbackBackdrop(title){
  return fallbackBackdrop(title);
}

export function buildFallbackProfile(name){
  return fallbackProfile(name);
}

export function buildFallbackLogo(title){
  return fallbackLogo(title);
}

export function buildFallbackEpisode(title){
  return fallbackEpisode(title);
}

export default {
  urlPoster,
  urlBackdrop,
  urlProfile,
  urlLogo,
  urlEpisode,
  makeInitials,
  buildFallbackPoster,
  buildFallbackBackdrop,
  buildFallbackProfile,
  buildFallbackLogo,
  buildFallbackEpisode,
};
