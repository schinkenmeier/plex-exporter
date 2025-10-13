import { showError } from '../errorHandler.js';

const POLICY_URL = 'hero.policy.json';

const DEFAULT_POLICY = Object.freeze({
  poolSizeMovies: 10,
  poolSizeSeries: 10,
  slots: {
    new: { quota: 0.3 },
    topRated: { quota: 0.3 },
    oldButGold: { quota: 0.2 },
    random: { quota: 0.2 }
  },
  diversity: {
    genre: 0.4,
    year: 0.35,
    antiRepeat: 0.25
  },
  rotation: {
    intervalMinutes: 360,
    minPoolSize: 6
  },
  textClamp: {
    title: 96,
    subtitle: 240,
    summary: 220
  },
  fallback: {
    prefer: 'movies',
    allowDuplicates: false
  },
  language: 'en-US',
  cache: {
    ttlHours: 24,
    graceMinutes: 15
  }
});

const SLOT_KEYS = ['new', 'topRated', 'oldButGold', 'random'];

let activePolicy = clone(DEFAULT_POLICY);
let policyLoadedAt = 0;
let validationIssues = [];

export async function initHeroPolicy(){
  validationIssues = [];
  let raw = null;
  let loadError = null;

  try {
    const response = await fetch(POLICY_URL, { cache: 'no-cache' });
    if(!response.ok){
      throw new Error(`HTTP ${response.status}`);
    }
    raw = await safeJson(response);
  } catch (error) {
    loadError = error;
    addIssue(`Failed to load policy (${error?.message || 'unknown error'})`);
    showError('Hero-Policy konnte nicht geladen werden', error?.message || 'Unbekannter Fehler');
  }

  activePolicy = sanitizePolicy(raw);
  policyLoadedAt = Date.now();

  reportValidationIssues(loadError);

  return activePolicy;
}

export function getHeroPolicy(){
  return clone(activePolicy);
}

export function getPoolSizes(){
  return {
    movies: activePolicy.poolSizeMovies,
    series: activePolicy.poolSizeSeries
  };
}

export function getSlotConfig(){
  const slots = {};
  SLOT_KEYS.forEach((key) => {
    slots[key] = { quota: activePolicy.slots[key].quota };
  });
  return slots;
}

export function getDiversityWeights(){
  return { ...activePolicy.diversity };
}

export function getRotationConfig(){
  return { ...activePolicy.rotation };
}

export function getTextClampConfig(){
  return { ...activePolicy.textClamp };
}

export function getFallbackPreference(){
  return { ...activePolicy.fallback };
}

export function getPolicyLanguage(){
  return activePolicy.language;
}

export function getCacheTtl(){
  const hours = Number(activePolicy.cache.ttlHours);
  const grace = Number(activePolicy.cache.graceMinutes);
  return {
    ttlHours: hours,
    ttlMs: hours * 60 * 60 * 1000,
    graceMinutes: grace,
    graceMs: grace * 60 * 1000
  };
}

export function getValidationIssues(){
  return validationIssues.slice();
}

export function getPolicyLoadedAt(){
  return policyLoadedAt;
}

function sanitizePolicy(raw){
  const target = clone(DEFAULT_POLICY);
  if(!raw || typeof raw !== 'object'){
    addIssue('Policy payload missing or invalid, using defaults.');
    return target;
  }

  target.poolSizeMovies = ensurePositiveInt(raw.poolSizeMovies, target.poolSizeMovies, 'poolSizeMovies');
  target.poolSizeSeries = ensurePositiveInt(raw.poolSizeSeries, target.poolSizeSeries, 'poolSizeSeries');

  const rawSlots = raw.slots && typeof raw.slots === 'object' ? raw.slots : {};
  SLOT_KEYS.forEach((key) => {
    const slot = rawSlots[key];
    const quota = ensureNumberInRange(slot?.quota, 0, 1, target.slots[key].quota, `slots.${key}.quota`);
    target.slots[key] = { quota };
  });

  const rawDiversity = raw.diversity && typeof raw.diversity === 'object' ? raw.diversity : {};
  target.diversity = {
    genre: ensureNumberInRange(rawDiversity.genre, 0, 1, target.diversity.genre, 'diversity.genre'),
    year: ensureNumberInRange(rawDiversity.year, 0, 1, target.diversity.year, 'diversity.year'),
    antiRepeat: ensureNumberInRange(rawDiversity.antiRepeat, 0, 1, target.diversity.antiRepeat, 'diversity.antiRepeat')
  };

  const rawRotation = raw.rotation && typeof raw.rotation === 'object' ? raw.rotation : {};
  target.rotation = {
    intervalMinutes: ensurePositiveInt(rawRotation.intervalMinutes, target.rotation.intervalMinutes, 'rotation.intervalMinutes'),
    minPoolSize: ensurePositiveInt(rawRotation.minPoolSize, target.rotation.minPoolSize, 'rotation.minPoolSize')
  };

  const rawClamp = raw.textClamp && typeof raw.textClamp === 'object' ? raw.textClamp : {};
  target.textClamp = {
    title: ensurePositiveInt(rawClamp.title, target.textClamp.title, 'textClamp.title'),
    subtitle: ensurePositiveInt(rawClamp.subtitle, target.textClamp.subtitle, 'textClamp.subtitle'),
    summary: ensurePositiveInt(rawClamp.summary, target.textClamp.summary, 'textClamp.summary')
  };

  const rawFallback = raw.fallback && typeof raw.fallback === 'object' ? raw.fallback : {};
  target.fallback = {
    prefer: ensureFallbackPreference(rawFallback.prefer, target.fallback.prefer),
    allowDuplicates: typeof rawFallback.allowDuplicates === 'boolean' ? rawFallback.allowDuplicates : target.fallback.allowDuplicates
  };

  target.language = typeof raw.language === 'string' && raw.language.trim() ? raw.language.trim() : target.language;
  if(target.language !== (raw.language || '').trim()){
    addIssue('language missing or invalid, defaulted to en-US.');
  }

  const rawCache = raw.cache && typeof raw.cache === 'object' ? raw.cache : {};
  const ttlHours = ensurePositiveInt(rawCache.ttlHours, target.cache.ttlHours, 'cache.ttlHours');
  const graceMinutes = ensurePositiveInt(rawCache.graceMinutes, target.cache.graceMinutes, 'cache.graceMinutes', true);
  target.cache = { ttlHours, graceMinutes };

  return target;
}

function ensurePositiveInt(value, fallback, field, allowZero){
  const num = Number(value);
  if(Number.isFinite(num) && (!allowZero ? num > 0 : num >= 0)){
    return Math.floor(num);
  }
  if(value != null){
    addIssue(`${field} invalid (${value}), using default (${fallback}).`);
  }
  return fallback;
}

function ensureNumberInRange(value, min, max, fallback, field){
  const num = Number(value);
  if(Number.isFinite(num) && num >= min && num <= max){
    return num;
  }
  if(value != null){
    addIssue(`${field} invalid (${value}), using default (${fallback}).`);
  }
  return fallback;
}

function ensureFallbackPreference(value, fallback){
  if(value === 'movies' || value === 'series' || value === 'shows'){
    return value === 'shows' ? 'series' : value;
  }
  if(value != null){
    addIssue(`fallback.prefer invalid (${value}), using default (${fallback}).`);
  }
  return fallback;
}

function clone(source){
  return JSON.parse(JSON.stringify(source));
}

async function safeJson(response){
  try {
    return await response.json();
  } catch (error) {
    addIssue(`Failed to parse hero policy JSON (${error?.message || error}).`);
    return null;
  }
}

function addIssue(message){
  if(!message) return;
  validationIssues.push(message);
}

function reportValidationIssues(loadError){
  if(!validationIssues.length) return;
  if(loadError){
    const followUps = validationIssues.slice(1);
    if(followUps.length){
      showError('Hero-Policy Hinweise', followUps.join(' • '));
    }
    return;
  }
  showError('Hero-Policy Hinweise', validationIssues.join(' • '));
}

