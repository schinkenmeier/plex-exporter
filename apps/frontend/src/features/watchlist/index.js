import { getState } from '../../core/state.js';

const STORAGE_KEY = 'watchlist:v2';
const STORAGE_SCHEMA_VERSION = 2;
const LOG_PREFIX = '[watchlist]';
const WATCHLIST_MODAL_ID = 'watchlistModal';
let saved = new Set();
let savedMeta = new Map();
let escapeHandlerAttached = false;

const storageAdapter = createStorageAdapter();

function createStorageAdapter(){
  const targets = ['sessionStorage', 'localStorage'];
  for(const target of targets){
    const store = resolveWebStorage(target);
    if(store) return buildWebStorageAdapter(store, target);
  }
  let memory = [];
  return {
    type: 'memory',
    load(){ return memory; },
    save(value){ memory = Array.isArray(value) ? value : []; },
    clear(){ memory = []; },
  };
}

function resolveWebStorage(name){
  try{
    const store = globalThis?.[name];
    if(!store) return null;
    const probe = `${STORAGE_KEY}:probe`;
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  }catch(err){
    console.warn(`${LOG_PREFIX} ${name} unavailable:`, err?.message || err);
    return null;
  }
}

function buildWebStorageAdapter(store, type){
  return {
    type,
    load(){
      try{
        const raw = store.getItem(STORAGE_KEY);
        if(!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }catch(err){
        console.warn(`${LOG_PREFIX} Failed to parse ${type} data:`, err?.message || err);
        return [];
      }
    },
    save(data){
      try{
        store.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(data) ? data : []));
      }catch(err){
        console.warn(`${LOG_PREFIX} Failed to persist ${type} data:`, err?.message || err);
      }
    },
    clear(){
      try{
        store.removeItem(STORAGE_KEY);
      }catch(err){
        console.warn(`${LOG_PREFIX} Failed to clear ${type} data:`, err?.message || err);
      }
    },
  };
}

function resetSavedState(){
  saved = new Set();
  savedMeta = new Map();
}

function hydrateSavedData(payload){
  resetSavedState();
  if(!payload) return;
  if(Array.isArray(payload)){
    payload.forEach(id => { if(typeof id === 'string' && id) saved.add(id); });
    return;
  }
  if(typeof payload !== 'object') return;
  const ids = Array.isArray(payload.ids) ? payload.ids : [];
  ids.forEach(id => { if(typeof id === 'string' && id) saved.add(id); });
  const entries = payload.entries && typeof payload.entries === 'object' ? payload.entries : {};
  Object.entries(entries).forEach(([id, value]) => {
    if(!id || typeof id !== 'string' || !value) return;
    savedMeta.set(id, value);
  });
}

function serializeSavedData(){
  const ids = Array.from(saved.values());
  const entries = {};
  savedMeta.forEach((value, key) => {
    if(!saved.has(key)) return;
    entries[key] = value;
  });
  return { version: STORAGE_SCHEMA_VERSION, ids, entries };
}

function getWatchlistModal(){ return document.getElementById(WATCHLIST_MODAL_ID); }

function ensureWatchlistModal(){
  const modal = getWatchlistModal();
  if(!modal) return null;
  if(modal.dataset.watchlistBound === 'true') return modal;
  modal.dataset.watchlistBound = 'true';
  modal.addEventListener('click', event => {
    if(event.target === modal) closePanel();
  });
  return modal;
}

function handleEscape(event){
  if(event.key !== 'Escape') return;
  event.preventDefault();
  closePanel();
}

function attachEscapeHandler(){
  if(escapeHandlerAttached) return;
  document.addEventListener('keydown', handleEscape);
  escapeHandlerAttached = true;
}

function detachEscapeHandler(){
  if(!escapeHandlerAttached) return;
  document.removeEventListener('keydown', handleEscape);
  escapeHandlerAttached = false;
}

function load(){
  try{
    const payload = storageAdapter.load();
    hydrateSavedData(payload);
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to load entries from storage:`, err?.message || err);
    resetSavedState();
  }
}
function persist(){
  try{
    const serialized = serializeSavedData();
    storageAdapter.save(serialized);
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to persist entries to storage:`, err?.message || err);
  }
}

function resolvePrimaryId(item){
  if(!item) return '';
  const ids = item.ids && typeof item.ids === 'object'
    ? Object.entries(item.ids)
    : [];
  const orderedKeys = ['imdb', 'slug', 'ratingKey', 'guid'];
  const candidates = [];
  if(item.watchlistPrimaryId){
    candidates.push(item.watchlistPrimaryId);
  }
  orderedKeys.forEach(key => {
    const match = ids.find(([entryKey]) => entryKey === key);
    if(match && match[1] != null){
      candidates.push(match[1]);
    }
  });
  ids.forEach(([key, value]) => {
    if(key === 'tmdb' || key === 'themoviedb') return;
    if(value != null) candidates.push(value);
  });
  candidates.push(item.ratingKey, item.rating_key, item.id);
  for(const value of candidates){
    if(value == null) continue;
    const str = String(value).trim();
    if(str) return str;
  }
  return '';
}

function idFor(item){
  if(!item) return '';
  const kind = (item.type==='tv' || item.libraryType==='show') ? 'show' : 'movie';
  const id = resolvePrimaryId(item);
  return id ? `${kind}:${id}` : '';
}

export function isSaved(item){ return saved.has(idFor(item)); }
export function count(){ return saved.size; }
export function toggle(item){
  const k=idFor(item);
  if(!k) return;
  if(saved.has(k)){
    saved.delete(k);
    savedMeta.delete(k);
  } else {
    saved.add(k);
    const meta = serializeItemSnapshot(k, item);
    if(meta) savedMeta.set(k, meta);
  }
  persist();
  renderCount();
  const panel=document.getElementById(WATCHLIST_MODAL_ID);
  if(panel && !panel.hidden) renderPanel();
}

export function renderCount(){
  const value = String(count());
  ['watchlistCount', 'watchlistCountLabel'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = value;
  });
}

export function openPanel(){
  const modal = ensureWatchlistModal();
  if(!modal) return;
  modal.hidden = false;
  modal.setAttribute('aria-hidden','false');
  document.body?.classList?.add('modal-open');
  attachEscapeHandler();
  const dialog = modal.querySelector('.watchlist-modal__content');
  dialog?.focus();
  renderPanel();
}

export function closePanel(){
  const modal=getWatchlistModal();
  if(modal){
    modal.hidden=true;
    modal.setAttribute('aria-hidden','true');
  }
  document.body?.classList?.remove('modal-open');
  detachEscapeHandler();
  setExpanded(false);
}

export function clear(){
  saved.clear();
  savedMeta.clear();
  if(typeof storageAdapter?.clear === 'function') storageAdapter.clear(); else persist();
  renderCount();
  renderPanel();
}

export function exportJson(){
  const items = listItems();
  const data = JSON.stringify(items, null, 2);
  const blob = new Blob([data], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'watchlist.json';
  document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

const API_BASE = typeof window !== 'undefined' && window.PLEX_EXPORTER_API_BASE
  ? window.PLEX_EXPORTER_API_BASE
  : '';

let adminEmailAvailable = false;

export async function sendEmail(email, sendCopyToAdmin = false){
  const items = listItems();
  if(items.length === 0){
    showToast('Keine Einträge in der Merkliste', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/watchlist/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        sendCopyToAdmin,
        items: items.map(item => ({
          title: item.title,
          type: item.type === 'tv' ? 'tv' : 'movie',
          year: getYearNumber(item),
          summary: item.summary,
          poster: item.poster
        }))
      })
    });

    if(!response.ok){
      const error = await response.json();
      throw new Error(error.error || 'Fehler beim E-Mail-Versand');
    }

    const result = await response.json();
    showToast('E-Mail erfolgreich versendet!', 'success');
    return result.emailId;
  } catch(err){
    console.error(`${LOG_PREFIX} Failed to send email:`, err);
    showToast(err.message || 'Fehler beim E-Mail-Versand', 'error');
    throw err;
  }
}

/**
 * Check if admin email is configured
 */
async function checkAdminEmail(){
  try {
    const response = await fetch(`${API_BASE}/api/watchlist/admin-email-configured`);
    if(response.ok){
      const data = await response.json();
      adminEmailAvailable = !!data.configured;
    } else {
      adminEmailAvailable = false;
    }
  } catch(err){
    console.warn(`${LOG_PREFIX} Failed to check admin email:`, err);
    adminEmailAvailable = false;
  }
}

/**
 * Show email modal dialog
 */
export async function showEmailDialog(){
  // Check admin email availability
  await checkAdminEmail();

  let modal = document.getElementById('watchlistEmailModal');
  if (!modal) {
    createEmailModal();
    modal = document.getElementById('watchlistEmailModal');
  }

  if (modal) {
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');

    // Show/hide admin copy checkbox based on availability
    const adminCopyGroup = modal.querySelector('.admin-copy-group');
    if(adminCopyGroup){
      adminCopyGroup.style.display = adminEmailAvailable ? 'block' : 'none';
    }
  } else {
    console.error(`${LOG_PREFIX} Modal element not found after creation!`);
  }
}

/**
 * Hide email modal dialog
 */
export function hideEmailDialog(){
  const modal = document.getElementById('watchlistEmailModal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');

    // Reset form
    const form = modal.querySelector('#watchlistEmailForm');
    if(form) form.reset();
  }
}

/**
 * Create email modal
 */
function createEmailModal() {
  const modal = document.createElement('div');
  modal.id = 'watchlistEmailModal';
  modal.className = 'modal-overlay';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-labelledby', 'watchlistEmailTitle');

  modal.innerHTML = `
    <div class="modal-content watchlist-email-modal">
      <div class="modal-header">
        <h2 id="watchlistEmailTitle">Merkliste per E-Mail senden</h2>
        <button id="closeWatchlistEmailModal" class="close-btn" aria-label="Schließen">&times;</button>
      </div>
      <div class="modal-body">
        <form id="watchlistEmailForm" class="watchlist-email-form">
          <div class="form-group">
            <label for="watchlistRecipientEmail">E-Mail-Adresse des Empfängers</label>
            <input
              type="email"
              id="watchlistRecipientEmail"
              name="email"
              placeholder="empfänger@email.de"
              required
            />
          </div>
          <div class="form-group admin-copy-group" style="display: none;">
            <label class="checkbox-label">
              <input
                type="checkbox"
                id="watchlistSendAdminCopy"
                name="sendAdminCopy"
                checked
              />
              <span>Kopie an Administrator senden</span>
            </label>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">E-Mail senden</button>
            <button type="button" id="cancelWatchlistEmail" class="btn-secondary">Abbrechen</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  const form = modal.querySelector('#watchlistEmailForm');
  const closeBtn = modal.querySelector('#closeWatchlistEmailModal');
  const cancelBtn = modal.querySelector('#cancelWatchlistEmail');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const email = formData.get('email');
      const sendAdminCopy = formData.get('sendAdminCopy') === 'on';

      try {
        await sendEmail(email, sendAdminCopy);
        hideEmailDialog();
      } catch(err) {
        console.error(`${LOG_PREFIX} Form submission error:`, err);
        // Error already handled in sendEmail
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', hideEmailDialog);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', hideEmailDialog);
  }

  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideEmailDialog();
    }
  });
}

function showToast(message, type = 'info'){
  if(typeof window.showErrorToast === 'function'){
    window.showErrorToast(message);
  } else {
    console.log(`[${type}] ${message}`);
  }
}

function listItems(){
  const s = getState();
  const pool = (s.movies||[]).concat(s.shows||[]);
  const map = new Map(pool.map(it=>[idFor(it), it]));
  const results = [];
  let metaUpdated = false;
  saved.forEach(id => {
    const matched = map.get(id);
    if(matched){
      if(!savedMeta.has(id)){
        const snapshot = serializeItemSnapshot(id, matched);
        if(snapshot){
          savedMeta.set(id, snapshot);
          metaUpdated = true;
        }
      }
      results.push(matched);
      return;
    }
    const fallback = reviveStoredItem(id);
    if(fallback) results.push(fallback);
  });
  if(metaUpdated) persist();
  return results;
}

export function renderPanel(){
  const list = document.getElementById('watchlistItems');
  const empty = document.getElementById('watchlistEmpty');
  if(!list || !empty) return;
  const items = listItems();
  const hasItems = items.length>0;
  ['clearWatchlist','exportWatchlist','emailWatchlist'].forEach(id => {
    const btn = document.getElementById(id);
    if(btn) btn.disabled = !hasItems;
  });
  if(!hasItems){ list.replaceChildren(); empty.hidden=false; return; }
  empty.hidden=true;
  const frag = document.createDocumentFragment();
  items.forEach(item=>{
    const li = document.createElement('li');
    li.className = 'watchlist-item';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'watchlist-item__info';

    const title = document.createElement('span');
    title.className='watchlist-item__title';
    title.textContent = item.title || '';

    const meta = document.createElement('span');
    meta.className = 'watchlist-item__meta';
    meta.textContent = describeItem(item);

    titleWrap.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'watchlist-item__actions';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'btn-link';
    open.textContent = 'Öffnen';
    open.addEventListener('click', ()=>{
      const kind = (item.type==='tv') ? 'show' : 'movie';
      const id = resolvePrimaryId(item);
      if(id) location.hash = `#/${kind}/${id}`;
    });

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn-link destructive';
    rm.textContent = 'Entfernen';
    rm.addEventListener('click', ()=>{ toggle(item); renderPanel(); });

    actions.append(open, rm);
    li.append(titleWrap, actions);
    frag.append(li);
  });
  list.replaceChildren(frag);
}

function describeItem(item){
  if(!item) return '';
  const parts = [];
  const kind = (item.type==='tv' || item.libraryType==='show') ? 'Serie' : 'Film';
  parts.push(kind);
  if(item.year) parts.push(item.year);
  const rating = item.contentRating || item.content_rating;
  if(rating) parts.push(rating);
  return parts.join(' · ');
}

function deriveYear(item){
  if(!item) return '';
  const source = item.year ?? item.originallyAvailableAt ?? item.premiereDate ?? item.addedAt ?? '';
  if(typeof source === 'number' && Number.isFinite(source)) return String(source);
  if(typeof source === 'string' && source.trim().length >= 4) return source.trim().slice(0, 4);
  return '';
}

function getYearNumber(item){
  if(!item) return undefined;
  const candidates = [
    item.yearNumeric,
    item.year,
    item.originallyAvailableAt,
    item.premiereDate,
    item.releaseDate,
    item.addedAt,
  ];
  for(const value of candidates){
    const parsed = parseYear(value);
    if(parsed != null) return parsed;
  }
  return undefined;
}

function parseYear(value){
  if(value == null) return undefined;
  if(typeof value === 'number'){
    if(Number.isFinite(value)) return Math.trunc(value);
    return undefined;
  }
  if(value instanceof Date){
    const year = value.getFullYear();
    return Number.isFinite(year) ? year : undefined;
  }
  const str = String(value).trim();
  if(!str) return undefined;
  const match = str.match(/(\d{4})/);
  if(!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function serializeItemSnapshot(id, item){
  if(!item || typeof item !== 'object') return null;
  const primaryId = resolvePrimaryId(item);
  const kind = (item.type==='tv' || item.libraryType==='show') ? 'show' : 'movie';
  const type = (item.type==='tv' || item.libraryType==='show') ? 'tv' : 'movie';
  const snapshot = {
    id,
    title: item.title || '',
    type,
    libraryType: item.libraryType || (type === 'tv' ? 'show' : 'movie'),
    year: deriveYear(item),
    yearNumeric: getYearNumber(item),
    contentRating: item.contentRating || item.content_rating || '',
    summary: item.summary || '',
    poster: item.poster || item.thumb || item.thumbFile || '',
    watchlistPrimaryId: primaryId,
    hash: primaryId ? `#/${kind}/${primaryId}` : '',
    ids: typeof item.ids === 'object' ? item.ids : undefined,
    ratingKey: item.ratingKey || item.rating_key || undefined,
    guid: item.guid || undefined,
  };
  return snapshot;
}

function reviveStoredItem(id){
  const entry = savedMeta.get(id);
  if(!entry) return null;
  return {
    id,
    title: entry.title || '',
    type: entry.type || 'movie',
    libraryType: entry.type === 'tv' ? 'show' : 'movie',
    year: entry.year || '',
    yearNumeric: entry.yearNumeric,
    contentRating: entry.contentRating || '',
    summary: entry.summary || '',
    poster: entry.poster || '',
    watchlistPrimaryId: entry.watchlistPrimaryId || entry.primaryId || '',
    ids: entry.ids || undefined,
    ratingKey: entry.ratingKey,
    guid: entry.guid,
    hash: entry.hash || '',
  };
}

export function initUi(){
  load();
  renderCount();
  ensureWatchlistModal();
  const openBtn = document.getElementById('openWatchlist');
  const toggleBtn = document.getElementById('watchlistToggle');
  const closeBtn = document.getElementById('closeWatchlist');
  const clearBtn = document.getElementById('clearWatchlist');
  const exportBtn = document.getElementById('exportWatchlist');
  const emailBtn = document.getElementById('emailWatchlist');
  openBtn && openBtn.addEventListener('click', ()=>{ openPanel(); setExpanded(true); });
  toggleBtn && toggleBtn.addEventListener('click', ()=>{
    const modal=document.getElementById(WATCHLIST_MODAL_ID);
    if(modal && !modal.hidden){ closePanel(); }
    else { openPanel(); setExpanded(true); }
  });
  closeBtn && closeBtn.addEventListener('click', ()=>{ closePanel(); });
  clearBtn && clearBtn.addEventListener('click', ()=>{ clear(); });
  exportBtn && exportBtn.addEventListener('click', ()=>{ exportJson(); });
  emailBtn && emailBtn.addEventListener('click', ()=>{ showEmailDialog(); });
}

function setExpanded(on){ const t=document.getElementById('watchlistToggle'); if(t) t.setAttribute('aria-expanded', on?'true':'false'); }

export const __testing = {
  listItems: () => listItems(),
};
