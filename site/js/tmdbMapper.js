import {
  urlPoster,
  urlBackdrop,
  urlProfile,
  urlLogo,
  urlEpisode,
  makeInitials,
} from './imageHelper.js';

const DEFAULT_OPTIONS = {
  imageBase: 'https://image.tmdb.org/t/p',
  posterSize: 'w500',
  backdropSize: 'w780',
  profileSize: 'h632',
  logoSize: 'w500',
  stillSize: 'w780',
  castLimit: 20,
  crewLimit: 40,
  region: 'DE',
};

function normaliseOptions(options = {}){
  return {
    ...DEFAULT_OPTIONS,
    ...options,
  };
}

function normaliseId(id){
  if(id == null) return '';
  const num = Number(id);
  if(Number.isFinite(num) && num > 0) return String(num);
  return String(id);
}

function scoreImage(entry){
  const votes = Number(entry.vote_count || entry.voteCount || 0);
  const rating = Number(entry.vote_average || entry.voteAverage || 0);
  return (rating * 10) + votes;
}

function normaliseLanguage(lang){
  if(!lang) return 'any';
  const str = String(lang).toLowerCase();
  if(str === 'xx' || str === 'null') return 'any';
  return str;
}

export function pickBestImage(images = [], { preferredLanguages = ['de', 'en', 'any'], fallbackPath = '' } = {}){
  if(!Array.isArray(images) || images.length === 0){
    return fallbackPath || '';
  }
  const sorted = images
    .filter(entry => entry && entry.file_path)
    .map(entry => ({
      ...entry,
      language: normaliseLanguage(entry.iso_639_1 || entry.language || ''),
      score: scoreImage(entry),
    }))
    .sort((a, b) => b.score - a.score);

  for(const language of preferredLanguages){
    const candidate = sorted.find(entry => entry.language === normaliseLanguage(language));
    if(candidate) return candidate.file_path || fallbackPath || '';
  }

  return sorted.length ? sorted[0].file_path || fallbackPath || '' : fallbackPath || '';
}

function extractCollection(detail, options){
  if(!detail?.belongs_to_collection) return null;
  const collection = detail.belongs_to_collection;
  return {
    id: normaliseId(collection.id),
    name: collection.name || '',
    poster: urlPoster(collection.poster_path, { imageBase: options.imageBase, size: options.posterSize, title: collection.name }),
    backdrop: urlBackdrop(collection.backdrop_path, { imageBase: options.imageBase, size: options.backdropSize, title: collection.name }),
  };
}

function mapGenres(list){
  if(!Array.isArray(list)) return [];
  return list.map(entry => entry && (entry.name || entry.title || entry.tag)).filter(Boolean).map(String);
}

function mapProductionCompanies(list, options){
  if(!Array.isArray(list)) return [];
  return list.map(company => ({
    id: normaliseId(company?.id),
    name: company?.name || '',
    originCountry: company?.origin_country || '',
    logo: urlLogo(company?.logo_path, { imageBase: options.imageBase, size: options.logoSize, title: company?.name }),
  }));
}

function mapProvider(entry, options){
  if(!entry) return null;
  const cfg = normaliseOptions(options);
  const id = normaliseId(entry.provider_id ?? entry.id);
  const name = entry.provider_name || entry.name || '';
  if(!name) return null;
  return {
    id,
    providerId: id,
    name,
    logoPath: entry.logo_path || '',
    logo: urlLogo(entry.logo_path, { imageBase: cfg.imageBase, size: cfg.logoSize, title: name }),
    displayPriority: entry.display_priority ?? entry.displayPriority ?? null,
  };
}

function mapWatchProviderRegion(regionData, options){
  if(!regionData) return null;
  const cfg = normaliseOptions(options);
  const types = ['flatrate', 'rent', 'buy', 'free', 'ads'];
  const mapped = { link: regionData.link || '' };
  for(const type of types){
    const list = Array.isArray(regionData[type]) ? regionData[type] : [];
    mapped[type] = list
      .map(entry => mapProvider(entry, cfg))
      .filter(Boolean);
  }
  return mapped;
}

function mapWatchProviders(payload, options = {}){
  const cfg = normaliseOptions(options);
  const results = payload?.results;
  if(!results || typeof results !== 'object') return {};
  const mapped = {};
  for(const [region, data] of Object.entries(results)){
    const regionKey = String(region || '').toUpperCase();
    if(!regionKey) continue;
    const mappedRegion = mapWatchProviderRegion(data, cfg);
    if(mappedRegion) mapped[regionKey] = mappedRegion;
  }
  const defaultRegion = String(options.region || cfg.region || '').toUpperCase();
  if(defaultRegion && mapped[defaultRegion]){
    mapped.default = mapped[defaultRegion];
  }
  return mapped;
}

function mapNetworks(list, options){
  if(!Array.isArray(list)) return [];
  return list.map(network => ({
    id: normaliseId(network?.id),
    name: network?.name || '',
    logo: urlLogo(network?.logo_path, { imageBase: options.imageBase, size: options.logoSize, title: network?.name }),
    originCountry: network?.origin_country || '',
  }));
}

function mapSeasons(list, options){
  if(!Array.isArray(list)) return [];
  return list.map(season => ({
    id: normaliseId(season?.id),
    name: season?.name || '',
    seasonNumber: season?.season_number ?? null,
    episodeCount: season?.episode_count ?? null,
    airDate: season?.air_date || '',
    poster: urlPoster(season?.poster_path, { imageBase: options.imageBase, size: options.posterSize, title: season?.name }),
  }));
}

function mapSpokenLanguages(list){
  if(!Array.isArray(list)) return [];
  return list.map(entry => ({
    code: entry?.iso_639_1 || '',
    name: entry?.english_name || entry?.name || '',
  }));
}

function pickCharacter(entry){
  if(entry?.character) return entry.character;
  if(Array.isArray(entry?.roles) && entry.roles.length){
    const role = entry.roles.find(r => r?.character) || entry.roles[0];
    return role?.character || '';
  }
  return '';
}

function pickJob(entry){
  if(entry?.job) return entry.job;
  if(Array.isArray(entry?.jobs) && entry.jobs.length){
    const job = entry.jobs.find(j => j?.job) || entry.jobs[0];
    return job?.job || '';
  }
  return '';
}

export function mapCredits(rawCredits, options = {}){
  const cfg = normaliseOptions(options);
  if(!rawCredits) return { cast: [], crew: [] };
  const castSource = Array.isArray(rawCredits.cast) && rawCredits.cast.length
    ? rawCredits.cast
    : Array.isArray(rawCredits?.aggregate?.cast) ? rawCredits.aggregate.cast : [];
  const crewSource = Array.isArray(rawCredits.crew) && rawCredits.crew.length
    ? rawCredits.crew
    : Array.isArray(rawCredits?.aggregate?.crew) ? rawCredits.aggregate.crew : [];

  const cast = castSource.slice(0, cfg.castLimit).map(person => ({
    id: normaliseId(person?.id),
    name: person?.name || person?.original_name || '',
    character: pickCharacter(person),
    order: person?.order ?? 0,
    profile: urlProfile(person?.profile_path, { imageBase: cfg.imageBase, size: cfg.profileSize, title: person?.name }),
    initials: makeInitials(person?.name || person?.original_name || ''),
    knownForDepartment: person?.known_for_department || '',
  }));

  const crew = crewSource.slice(0, cfg.crewLimit).map(person => ({
    id: normaliseId(person?.id),
    name: person?.name || person?.original_name || '',
    job: pickJob(person),
    department: person?.department || '',
    profile: urlProfile(person?.profile_path, { imageBase: cfg.imageBase, size: cfg.profileSize, title: person?.name }),
    initials: makeInitials(person?.name || person?.original_name || ''),
  }));

  return { cast, crew };
}

function selectReleaseCertification(results = []){
  const priorityCountries = ['DE', 'AT', 'CH', 'US'];
  for(const country of priorityCountries){
    const entry = results.find(item => item?.iso_3166_1 === country);
    if(!entry) continue;
    const releases = Array.isArray(entry.release_dates) ? entry.release_dates : [];
    const candidates = releases
      .filter(release => release && typeof release.certification === 'string' && release.certification.trim())
      .sort((a, b) => {
        const typeA = a.type ?? 0;
        const typeB = b.type ?? 0;
        if(typeA !== typeB) return typeA - typeB;
        const dateA = Date.parse(a.release_date || '') || 0;
        const dateB = Date.parse(b.release_date || '') || 0;
        return dateA - dateB;
      });
    if(candidates.length) return candidates[0].certification.trim();
  }
  return '';
}

export function getContentRatingDE(payload = {}){
  if(payload.release_dates?.results){
    const cert = selectReleaseCertification(payload.release_dates.results);
    if(cert) return cert;
  }
  if(payload.content_ratings?.results){
    const results = Array.isArray(payload.content_ratings.results) ? payload.content_ratings.results : [];
    const german = results.find(entry => entry?.iso_3166_1 === 'DE' && entry?.rating);
    if(german) return String(german.rating).trim();
    const us = results.find(entry => entry?.iso_3166_1 === 'US' && entry?.rating);
    if(us) return String(us.rating).trim();
  }
  return '';
}

function buildImageCollection(images = [], mapper){
  if(!Array.isArray(images)) return [];
  return images
    .filter(entry => entry && entry.file_path)
    .map(mapper);
}

export function mapMovieDetail(detail, options = {}){
  if(!detail) return null;
  const cfg = normaliseOptions(options);
  const posterPath = pickBestImage(detail.images?.posters, { fallbackPath: detail.poster_path });
  const backdropPath = pickBestImage(detail.images?.backdrops, { fallbackPath: detail.backdrop_path, preferredLanguages: ['de', 'en', 'any'] });

  return {
    type: 'movie',
    id: normaliseId(detail.id),
    title: detail.title || detail.original_title || '',
    originalTitle: detail.original_title || '',
    overview: detail.overview || '',
    tagline: detail.tagline || '',
    releaseDate: detail.release_date || '',
    runtime: Number(detail.runtime) || null,
    status: detail.status || '',
    homepage: detail.homepage || '',
    imdbId: detail.imdb_id || '',
    collection: extractCollection(detail, cfg),
    poster: urlPoster(posterPath, { imageBase: cfg.imageBase, size: cfg.posterSize, title: detail.title }),
    posterPath,
    backdrop: urlBackdrop(backdropPath, { imageBase: cfg.imageBase, size: cfg.backdropSize, title: detail.title }),
    backdropPath,
    genres: mapGenres(detail.genres),
    voteAverage: Number(detail.vote_average) || 0,
    voteCount: Number(detail.vote_count) || 0,
    popularity: Number(detail.popularity) || 0,
    productionCountries: Array.isArray(detail.production_countries) ? detail.production_countries.map(entry => entry?.iso_3166_1 || entry?.name || '').filter(Boolean) : [],
    productionCompanies: mapProductionCompanies(detail.production_companies, cfg),
    spokenLanguages: mapSpokenLanguages(detail.spoken_languages),
    contentRating: getContentRatingDE(detail),
    credits: mapCredits(detail.credits, cfg),
    images: {
      posters: buildImageCollection(detail.images?.posters, entry => ({
        path: entry.file_path,
        url: urlPoster(entry.file_path, { imageBase: cfg.imageBase, size: cfg.posterSize, title: detail.title }),
        width: entry.width,
        height: entry.height,
        voteAverage: entry.vote_average,
        voteCount: entry.vote_count,
        language: entry.iso_639_1 || '',
      })),
      backdrops: buildImageCollection(detail.images?.backdrops, entry => ({
        path: entry.file_path,
        url: urlBackdrop(entry.file_path, { imageBase: cfg.imageBase, size: cfg.backdropSize, title: detail.title }),
        width: entry.width,
        height: entry.height,
        voteAverage: entry.vote_average,
        voteCount: entry.vote_count,
        language: entry.iso_639_1 || '',
      })),
    },
    watchProviders: mapWatchProviders(detail['watch/providers'], cfg),
    url: detail.id ? `https://www.themoviedb.org/movie/${detail.id}` : '',
    raw: detail,
  };
}

export function mapTvDetail(detail, options = {}){
  if(!detail) return null;
  const cfg = normaliseOptions(options);
  const posterPath = pickBestImage(detail.images?.posters, { fallbackPath: detail.poster_path });
  const backdropPath = pickBestImage(detail.images?.backdrops, { fallbackPath: detail.backdrop_path, preferredLanguages: ['de', 'en', 'any'] });

  return {
    type: 'tv',
    id: normaliseId(detail.id),
    name: detail.name || detail.original_name || '',
    originalName: detail.original_name || '',
    overview: detail.overview || '',
    tagline: detail.tagline || '',
    firstAirDate: detail.first_air_date || '',
    lastAirDate: detail.last_air_date || '',
    numberOfEpisodes: Number(detail.number_of_episodes) || 0,
    numberOfSeasons: Number(detail.number_of_seasons) || 0,
    status: detail.status || '',
    homepage: detail.homepage || '',
    inProduction: !!detail.in_production,
    poster: urlPoster(posterPath, { imageBase: cfg.imageBase, size: cfg.posterSize, title: detail.name }),
    posterPath,
    backdrop: urlBackdrop(backdropPath, { imageBase: cfg.imageBase, size: cfg.backdropSize, title: detail.name }),
    backdropPath,
    genres: mapGenres(detail.genres),
    voteAverage: Number(detail.vote_average) || 0,
    voteCount: Number(detail.vote_count) || 0,
    popularity: Number(detail.popularity) || 0,
    createdBy: Array.isArray(detail.created_by) ? detail.created_by.map(person => ({
      id: normaliseId(person?.id),
      name: person?.name || '',
      profile: urlProfile(person?.profile_path, { imageBase: cfg.imageBase, size: cfg.profileSize, title: person?.name }),
      initials: makeInitials(person?.name || ''),
    })) : [],
    networks: mapNetworks(detail.networks, cfg),
    productionCompanies: mapProductionCompanies(detail.production_companies, cfg),
    seasons: mapSeasons(detail.seasons, cfg),
    contentRating: getContentRatingDE(detail),
    credits: mapCredits(detail.aggregate_credits || detail.credits, cfg),
    images: {
      posters: buildImageCollection(detail.images?.posters, entry => ({
        path: entry.file_path,
        url: urlPoster(entry.file_path, { imageBase: cfg.imageBase, size: cfg.posterSize, title: detail.name }),
        width: entry.width,
        height: entry.height,
        voteAverage: entry.vote_average,
        voteCount: entry.vote_count,
        language: entry.iso_639_1 || '',
      })),
      backdrops: buildImageCollection(detail.images?.backdrops, entry => ({
        path: entry.file_path,
        url: urlBackdrop(entry.file_path, { imageBase: cfg.imageBase, size: cfg.backdropSize, title: detail.name }),
        width: entry.width,
        height: entry.height,
        voteAverage: entry.vote_average,
        voteCount: entry.vote_count,
        language: entry.iso_639_1 || '',
      })),
      logos: buildImageCollection(detail.images?.logos, entry => ({
        path: entry.file_path,
        url: urlLogo(entry.file_path, { imageBase: cfg.imageBase, size: cfg.logoSize, title: detail.name }),
        width: entry.width,
        height: entry.height,
        language: entry.iso_639_1 || '',
      })),
    },
    watchProviders: mapWatchProviders(detail['watch/providers'], cfg),
    url: detail.id ? `https://www.themoviedb.org/tv/${detail.id}` : '',
    raw: detail,
  };
}

export function mapSeasonDetail(seasonDetail, options = {}){
  if(!seasonDetail) return null;
  const cfg = normaliseOptions(options);
  const show = options.show || {};
  const posterPath = pickBestImage(seasonDetail.images?.posters, { fallbackPath: seasonDetail.poster_path });

  const episodes = Array.isArray(seasonDetail.episodes) ? seasonDetail.episodes.map(episode => {
    const stillPath = pickBestImage(episode?.images?.stills, { fallbackPath: episode?.still_path });
    return {
      id: normaliseId(episode?.id),
      episodeNumber: episode?.episode_number ?? null,
      seasonNumber: episode?.season_number ?? seasonDetail.season_number ?? null,
      name: episode?.name || '',
      overview: episode?.overview || '',
      airDate: episode?.air_date || '',
      runtime: Number(episode?.runtime) || null,
      voteAverage: Number(episode?.vote_average) || 0,
      voteCount: Number(episode?.vote_count) || 0,
      still: urlEpisode(stillPath, { imageBase: cfg.imageBase, size: cfg.stillSize, title: episode?.name || seasonDetail.name }),
      stillPath,
      crew: mapCredits({ crew: episode?.crew || [] }, cfg).crew,
      guestStars: mapCredits({ cast: episode?.guest_stars || [] }, { ...cfg, castLimit: 10 }).cast,
    };
  }) : [];

  return {
    type: 'season',
    id: normaliseId(seasonDetail.id),
    showId: normaliseId(show.id || seasonDetail.show_id || ''),
    name: seasonDetail.name || '',
    overview: seasonDetail.overview || '',
    airDate: seasonDetail.air_date || '',
    seasonNumber: seasonDetail.season_number ?? null,
    episodeCount: seasonDetail.episodes ? seasonDetail.episodes.length : seasonDetail.episode_count || 0,
    poster: urlPoster(posterPath, { imageBase: cfg.imageBase, size: cfg.posterSize, title: seasonDetail.name || show.name }),
    posterPath,
    episodes,
    credits: mapCredits(seasonDetail.credits, cfg),
    url: show.id ? `https://www.themoviedb.org/tv/${show.id}/season/${seasonDetail.season_number ?? ''}` : '',
    raw: seasonDetail,
  };
}

export default {
  mapMovieDetail,
  mapTvDetail,
  mapSeasonDetail,
  mapCredits,
  pickBestImage,
  getContentRatingDE,
};
