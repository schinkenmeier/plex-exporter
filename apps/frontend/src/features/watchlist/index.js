import { getState } from '../../core/state.js';

const STORAGE_KEY = 'watchlist:v1';
const LOG_PREFIX = '[watchlist]';
let saved = new Set();

function load(){
  try{
    saved = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'));
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to load entries from storage:`, err?.message || err);
    saved = new Set();
  }
}
function persist(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(saved.values())));
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
  if(saved.has(k)) saved.delete(k); else saved.add(k);
  persist();
  renderCount();
  const panel=document.getElementById('watchlistPanel');
  if(panel && !panel.hidden) renderPanel();
}

export function renderCount(){ const el=document.getElementById('watchlistCount'); if(el) el.textContent = String(count()); }

export function openPanel(){
  const p=document.getElementById('watchlistPanel');
  if(p) {
    p.hidden=false;
    p.setAttribute('aria-hidden','false');
    renderPanel();
  }
}

export function closePanel(){
  const p=document.getElementById('watchlistPanel');
  if(p){
    p.hidden=true;
    p.setAttribute('aria-hidden','true');
  }
  setExpanded(false);
}

export function clear(){ saved.clear(); persist(); renderCount(); renderPanel(); }

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
          year: item.year,
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
  console.log(`${LOG_PREFIX} showEmailDialog called`);

  // Check admin email availability
  await checkAdminEmail();
  console.log(`${LOG_PREFIX} Admin email available:`, adminEmailAvailable);

  let modal = document.getElementById('watchlistEmailModal');
  if (!modal) {
    console.log(`${LOG_PREFIX} Creating new modal`);
    createEmailModal();
    modal = document.getElementById('watchlistEmailModal');
  }

  if (modal) {
    console.log(`${LOG_PREFIX} Showing modal`);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');

    // Show/hide admin copy checkbox based on availability
    const adminCopyGroup = modal.querySelector('.admin-copy-group');
    if(adminCopyGroup){
      adminCopyGroup.style.display = adminEmailAvailable ? 'block' : 'none';
      console.log(`${LOG_PREFIX} Admin copy group display:`, adminCopyGroup.style.display);
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

      console.log(`${LOG_PREFIX} Form submitted:`, { email, sendAdminCopy });

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
  return Array.from(saved.values()).map(k=>map.get(k)).filter(Boolean);
}

export function renderPanel(){
  const list = document.getElementById('watchlistItems');
  const empty = document.getElementById('watchlistEmpty');
  if(!list || !empty) return;
  const items = listItems();
  if(items.length===0){ list.replaceChildren(); empty.hidden=false; return; }
  empty.hidden=true;
  const frag = document.createDocumentFragment();
  items.forEach(item=>{
    const li = document.createElement('li');
    li.className = 'watchlist-item';
    const t = document.createElement('span');
    t.className='title';
    t.textContent = item.title || '';
    const rm = document.createElement('button');
    rm.textContent = 'Entfernen';
    rm.addEventListener('click', ()=>{ toggle(item); renderPanel(); });
    const open = document.createElement('button');
    open.textContent = 'Öffnen';
    open.addEventListener('click', ()=>{
      const kind = (item.type==='tv') ? 'show' : 'movie';
      const id = resolvePrimaryId(item);
      if(id) location.hash = `#/${kind}/${id}`;
    });
    li.append(t, open, rm);
    frag.append(li);
  });
  list.replaceChildren(frag);
}

export function initUi(){
  load();
  renderCount();
  const openBtn = document.getElementById('openWatchlist');
  const toggleBtn = document.getElementById('watchlistToggle');
  const closeBtn = document.getElementById('closeWatchlist');
  const clearBtn = document.getElementById('clearWatchlist');
  const exportBtn = document.getElementById('exportWatchlist');
  const emailBtn = document.getElementById('emailWatchlist');
  openBtn && openBtn.addEventListener('click', ()=>{ openPanel(); setExpanded(true); });
  toggleBtn && toggleBtn.addEventListener('click', ()=>{ const p=document.getElementById('watchlistPanel'); if(p && !p.hidden){ closePanel(); } else { openPanel(); setExpanded(true); } });
  closeBtn && closeBtn.addEventListener('click', ()=>{ closePanel(); });
  clearBtn && clearBtn.addEventListener('click', ()=>{ clear(); });
  exportBtn && exportBtn.addEventListener('click', ()=>{ exportJson(); });
  emailBtn && emailBtn.addEventListener('click', ()=>{ showEmailDialog(); });
}

function setExpanded(on){ const t=document.getElementById('watchlistToggle'); if(t) t.setAttribute('aria-expanded', on?'true':'false'); }
