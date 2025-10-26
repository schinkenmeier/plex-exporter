/**
 * Bookmarks Feature
 * Manages bookmarks with backend API integration
 */

const API_BASE = window.PLEX_EXPORTER_API_BASE || 'http://localhost:4001';
const USER_ID = 'default-user'; // TODO: Replace with actual user authentication
const LOG_PREFIX = '[bookmarks]';

let bookmarks = [];
let isLoading = false;

/**
 * Fetch bookmarks from backend
 */
export async function fetchBookmarks() {
  try {
    isLoading = true;
    const response = await fetch(`${API_BASE}/api/bookmarks`, {
      headers: { 'x-user-id': USER_ID },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch bookmarks: ${response.statusText}`);
    }

    const result = await response.json();
    bookmarks = result.data || [];
    renderCount();
    return bookmarks;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to fetch bookmarks:`, err);
    showToast('Fehler beim Laden der Lesezeichen', 'error');
    return [];
  } finally {
    isLoading = false;
  }
}

/**
 * Add a bookmark
 */
export async function addBookmark(mediaItemId) {
  try {
    const response = await fetch(`${API_BASE}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': USER_ID,
      },
      body: JSON.stringify({ mediaItemId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add bookmark');
    }

    const result = await response.json();
    await fetchBookmarks(); // Refresh list
    showToast('Lesezeichen hinzugefügt', 'success');
    return result.data;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to add bookmark:`, err);
    showToast(err.message || 'Fehler beim Hinzufügen', 'error');
    throw err;
  }
}

/**
 * Remove a bookmark
 */
export async function removeBookmark(mediaItemId) {
  try {
    const response = await fetch(`${API_BASE}/api/bookmarks/${mediaItemId}`, {
      method: 'DELETE',
      headers: { 'x-user-id': USER_ID },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove bookmark');
    }

    await fetchBookmarks(); // Refresh list
    showToast('Lesezeichen entfernt', 'success');
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to remove bookmark:`, err);
    showToast(err.message || 'Fehler beim Entfernen', 'error');
    throw err;
  }
}

/**
 * Check if item is bookmarked
 */
export function isBookmarked(mediaItemId) {
  return bookmarks.some((b) => b.mediaItemId === mediaItemId);
}

/**
 * Toggle bookmark
 */
export async function toggleBookmark(mediaItemId) {
  if (isBookmarked(mediaItemId)) {
    await removeBookmark(mediaItemId);
  } else {
    await addBookmark(mediaItemId);
  }
  renderPanel();
}

/**
 * Send bookmarks via email
 */
export async function sendBookmarksEmail(email) {
  try {
    const response = await fetch(`${API_BASE}/api/bookmarks/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': USER_ID,
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send email');
    }

    const result = await response.json();
    showToast('E-Mail erfolgreich versendet!', 'success');
    return result.emailId;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to send email:`, err);
    showToast(err.message || 'Fehler beim E-Mail-Versand', 'error');
    throw err;
  }
}

/**
 * Clear all bookmarks
 */
export async function clearAllBookmarks() {
  if (!confirm('Möchtest du wirklich alle Lesezeichen löschen?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/bookmarks`, {
      method: 'DELETE',
      headers: { 'x-user-id': USER_ID },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to clear bookmarks');
    }

    await fetchBookmarks();
    showToast('Alle Lesezeichen gelöscht', 'success');
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to clear bookmarks:`, err);
    showToast(err.message || 'Fehler beim Löschen', 'error');
  }
}

/**
 * Get bookmark count
 */
export function count() {
  return bookmarks.length;
}

/**
 * Render bookmark count
 */
export function renderCount() {
  const el = document.getElementById('bookmarksCount');
  if (el) el.textContent = String(count());
}

/**
 * Open bookmarks panel
 */
export function openPanel() {
  const panel = document.getElementById('bookmarksPanel');
  if (panel) {
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    renderPanel();
  }
}

/**
 * Close bookmarks panel
 */
export function closePanel() {
  const panel = document.getElementById('bookmarksPanel');
  if (panel) {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
  }
  setExpanded(false);
}

/**
 * Render bookmarks panel
 */
export function renderPanel() {
  const list = document.getElementById('bookmarksItems');
  const empty = document.getElementById('bookmarksEmpty');
  if (!list || !empty) return;

  if (bookmarks.length === 0) {
    list.replaceChildren();
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  const frag = document.createDocumentFragment();

  bookmarks.forEach((bookmark) => {
    const li = document.createElement('li');
    li.className = 'bookmarks-item';

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = bookmark.mediaItem.title || '';

    const type = document.createElement('span');
    type.className = 'type';
    type.textContent = bookmark.mediaItem.type === 'movie' ? 'Film' : 'Serie';

    const year = document.createElement('span');
    year.className = 'year';
    year.textContent = bookmark.mediaItem.year ? `(${bookmark.mediaItem.year})` : '';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Entfernen';
    removeBtn.className = 'btn-small';
    removeBtn.addEventListener('click', () => {
      removeBookmark(bookmark.mediaItemId);
    });

    actions.append(removeBtn);

    const info = document.createElement('div');
    info.className = 'info';
    info.append(title, type, year);

    li.append(info, actions);
    frag.append(li);
  });

  list.replaceChildren(frag);
}

/**
 * Show email dialog
 */
export function showEmailDialog() {
  const email = prompt('E-Mail-Adresse für Lesezeichen:');
  if (email && email.includes('@')) {
    sendBookmarksEmail(email);
  } else if (email) {
    showToast('Ungültige E-Mail-Adresse', 'error');
  }
}

/**
 * Initialize bookmarks UI
 */
export function initUi() {
  // Fetch initial bookmarks
  fetchBookmarks();

  // Setup event listeners
  const toggleBtn = document.getElementById('bookmarksToggle');
  const closeBtn = document.getElementById('closeBookmarks');
  const clearBtn = document.getElementById('clearBookmarks');
  const emailBtn = document.getElementById('emailBookmarks');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const panel = document.getElementById('bookmarksPanel');
      if (panel && !panel.hidden) {
        closePanel();
      } else {
        openPanel();
        setExpanded(true);
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closePanel);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearAllBookmarks);
  }

  if (emailBtn) {
    emailBtn.addEventListener('click', showEmailDialog);
  }
}

/**
 * Set expanded state
 */
function setExpanded(on) {
  const btn = document.getElementById('bookmarksToggle');
  if (btn) btn.setAttribute('aria-expanded', on ? 'true' : 'false');
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  // Check if errorToast module exists
  if (typeof window.showErrorToast === 'function') {
    window.showErrorToast(message);
  } else {
    console.log(`[${type}] ${message}`);
  }
}
