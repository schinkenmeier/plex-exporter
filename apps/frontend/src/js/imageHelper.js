const DEFAULT_IMAGE_BASE = '';
const DEFAULT_SIZES = {
  poster: 'w500',
  backdrop: 'w780',
  profile: 'h632',
};

function normaliseBase(base){
  const raw = String(base || DEFAULT_IMAGE_BASE).trim();
  if(!raw) return DEFAULT_IMAGE_BASE;
  return raw.replace(/\/$/, '');
}

function buildUrl(path, size, base){
  const raw = String(path || '').trim();
  if(!raw) return '';
  if(/^data:/i.test(raw)) return raw;
  if(/^https?:\/\//i.test(raw)) return raw;
  if(raw.startsWith('//')) return `https:${raw}`;
  if(raw.startsWith('/api/')) return raw;
  if(raw.startsWith('/')) return raw;
  const root = normaliseBase(base);
  if(!root) return '';
  const normalizedRoot = root.replace(/\/+$/, '');
  const normalizedSize = size ? String(size).replace(/^\/+|\/+$/g, '') : '';
  const normalizedPath = raw.replace(/^\/+/, '');
  const segments = [normalizedRoot];
  if(normalizedSize) segments.push(normalizedSize);
  segments.push(normalizedPath);
  return segments.join('/');
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
    default:
      return '#101827';
  }
}

function pickForeground(type){
  return '#f9fafb';
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

export function buildFallbackPoster(title){
  return fallbackPoster(title);
}

export function buildFallbackBackdrop(title){
  return fallbackBackdrop(title);
}

export function buildFallbackProfile(name){
  return fallbackProfile(name);
}

export default {
  urlPoster,
  urlBackdrop,
  urlProfile,
  makeInitials,
  buildFallbackPoster,
  buildFallbackBackdrop,
  buildFallbackProfile,
};
