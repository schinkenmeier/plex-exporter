/**
 * Newsletter Feature
 * Manages newsletter subscriptions with backend API integration
 */

const API_BASE = window.PLEX_EXPORTER_API_BASE || 'http://localhost:4001';
const STORAGE_KEY = 'newsletter:subscription';
const LOG_PREFIX = '[newsletter]';

let subscriptionData = null;

/**
 * Load subscription status from localStorage
 */
function loadSubscription() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      subscriptionData = JSON.parse(data);
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to load subscription:`, err);
  }
}

/**
 * Save subscription status to localStorage
 */
function saveSubscription(data) {
  try {
    subscriptionData = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to save subscription:`, err);
  }
}

/**
 * Check if user is subscribed
 */
export function isSubscribed() {
  return subscriptionData && subscriptionData.active;
}

/**
 * Get current subscription
 */
export function getSubscription() {
  return subscriptionData;
}

/**
 * Subscribe to newsletter
 */
export async function subscribe(email, mediaType = null) {
  try {
    const response = await fetch(`${API_BASE}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, mediaType }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to subscribe');
    }

    const result = await response.json();
    saveSubscription(result.data);
    showToast('Newsletter erfolgreich abonniert!', 'success');
    renderStatus();
    return result.data;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to subscribe:`, err);
    showToast(err.message || 'Fehler beim Abonnieren', 'error');
    throw err;
  }
}

/**
 * Unsubscribe from newsletter
 */
export async function unsubscribe(email) {
  try {
    const response = await fetch(`${API_BASE}/api/newsletter/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to unsubscribe');
    }

    if (subscriptionData) {
      subscriptionData.active = false;
      saveSubscription(subscriptionData);
    }
    showToast('Newsletter abbestellt', 'success');
    renderStatus();
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to unsubscribe:`, err);
    showToast(err.message || 'Fehler beim Abbestellen', 'error');
    throw err;
  }
}

/**
 * Show newsletter dialog
 */
export function showNewsletterDialog() {
  const modal = document.getElementById('newsletterModal');
  if (!modal) {
    createNewsletterModal();
  }

  const modalEl = document.getElementById('newsletterModal');
  if (modalEl) {
    modalEl.hidden = false;
    modalEl.setAttribute('aria-hidden', 'false');
    renderStatus();
  }
}

/**
 * Hide newsletter dialog
 */
export function hideNewsletterDialog() {
  const modal = document.getElementById('newsletterModal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Create newsletter modal
 */
function createNewsletterModal() {
  const modal = document.createElement('div');
  modal.id = 'newsletterModal';
  modal.className = 'modal-overlay';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-labelledby', 'newsletterTitle');

  modal.innerHTML = `
    <div class="modal-content newsletter-modal">
      <div class="modal-header">
        <h2 id="newsletterTitle">Newsletter</h2>
        <button id="closeNewsletterModal" class="close-btn" aria-label="Schließen">&times;</button>
      </div>
      <div class="modal-body">
        <div id="newsletterStatus"></div>
        <form id="newsletterForm" class="newsletter-form">
          <div class="form-group">
            <label for="newsletterEmail">E-Mail-Adresse</label>
            <input
              type="email"
              id="newsletterEmail"
              name="email"
              placeholder="deine@email.de"
              required
            />
          </div>
          <div class="form-group">
            <label for="newsletterType">Inhaltstyp</label>
            <select id="newsletterType" name="mediaType">
              <option value="">Alle (Filme & Serien)</option>
              <option value="movie">Nur Filme</option>
              <option value="tv">Nur Serien</option>
            </select>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">Abonnieren</button>
            <button type="button" id="unsubscribeBtn" class="btn-secondary">Abbestellen</button>
          </div>
        </form>
        <div class="newsletter-info">
          <p>📧 Erhalte Benachrichtigungen über neu hinzugefügte Filme und Serien</p>
          <p>🔒 Deine E-Mail-Adresse wird nicht weitergegeben</p>
          <p>🎬 Filtere nach Filmen oder Serien, oder erhalte alle Updates</p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  const form = modal.querySelector('#newsletterForm');
  const closeBtn = modal.querySelector('#closeNewsletterModal');
  const unsubBtn = modal.querySelector('#unsubscribeBtn');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const email = formData.get('email');
      const mediaType = formData.get('mediaType') || null;
      await subscribe(email, mediaType);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', hideNewsletterDialog);
  }

  if (unsubBtn) {
    unsubBtn.addEventListener('click', async () => {
      if (subscriptionData && subscriptionData.email) {
        await unsubscribe(subscriptionData.email);
      } else {
        showToast('Keine aktive Anmeldung gefunden', 'error');
      }
    });
  }

  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideNewsletterDialog();
    }
  });
}

/**
 * Render subscription status
 */
function renderStatus() {
  const statusEl = document.getElementById('newsletterStatus');
  if (!statusEl) return;

  if (isSubscribed()) {
    const mediaTypeLabel = subscriptionData.mediaType === 'movie'
      ? 'Filme'
      : subscriptionData.mediaType === 'tv'
      ? 'Serien'
      : 'Alle';

    statusEl.innerHTML = `
      <div class="status-message success">
        ✓ Newsletter aktiv für ${subscriptionData.email}
        <br>
        <small>Filter: ${mediaTypeLabel}</small>
      </div>
    `;
  } else {
    statusEl.innerHTML = `
      <div class="status-message info">
        ℹ️ Du hast den Newsletter noch nicht abonniert
      </div>
    `;
  }
}

/**
 * Initialize newsletter UI
 */
export function initUi() {
  loadSubscription();

  const newsletterBtn = document.getElementById('newsletterBtn');
  if (newsletterBtn) {
    newsletterBtn.addEventListener('click', showNewsletterDialog);
  }

  // Update header button if subscribed
  if (isSubscribed()) {
    const btn = document.getElementById('newsletterBtn');
    if (btn) {
      btn.classList.add('subscribed');
      btn.title = 'Newsletter abonniert';
    }
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  if (typeof window.showErrorToast === 'function') {
    window.showErrorToast(message);
  } else {
    console.log(`[${type}] ${message}`);
  }
}
