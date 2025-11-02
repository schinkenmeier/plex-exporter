let container = null;

function ensureContainer() {
  if (container && document.body.contains(container)) {
    return container;
  }

  container = document.getElementById('errorContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'errorContainer';
    container.className = 'error-container';
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  return container;
}

export function getErrorContainer() {
  return ensureContainer();
}

export function dismissToast(toast) {
  if (!toast) return;
  toast.classList.add('error-toast-exit');
  setTimeout(() => {
    toast.remove();
  }, 300);
}

function mountToast(toast) {
  const host = ensureContainer();
  host.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('error-toast-show');
  });
  return toast;
}

export function createErrorToast({ title, message }) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.innerHTML = `
    <div class="error-toast-content">
      <div class="error-toast-icon">⚠️</div>
      <div class="error-toast-text">
        <div class="error-toast-title">${escapeHtml(title)}</div>
        ${message ? `<div class="error-toast-message">${escapeHtml(message)}</div>` : ''}
      </div>
      <button class="error-toast-close" aria-label="Schließen">×</button>
    </div>
  `;

  const closeBtn = toast.querySelector('.error-toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => dismissToast(toast));
  }

  return mountToast(toast);
}

export function createRetryableErrorToast({ title, onRetry }) {
  const toast = document.createElement('div');
  toast.className = 'error-toast error-toast-retryable';
  toast.innerHTML = `
    <div class="error-toast-content">
      <div class="error-toast-icon">⚠️</div>
      <div class="error-toast-text">
        <div class="error-toast-title">${escapeHtml(title)}</div>
      </div>
      <button class="error-toast-retry">Erneut versuchen</button>
      <button class="error-toast-close" aria-label="Schließen">×</button>
    </div>
  `;

  const retryBtn = toast.querySelector('.error-toast-retry');
  if (retryBtn && typeof onRetry === 'function') {
    retryBtn.addEventListener('click', () => {
      dismissToast(toast);
      Promise.resolve().then(onRetry).catch(err => {
        console.error('[errorToast] Retry handler failed:', err);
      });
    });
  }

  const closeBtn = toast.querySelector('.error-toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => dismissToast(toast));
  }

  return mountToast(toast);
}

export function clearErrorToasts() {
  const host = ensureContainer();
  host.innerHTML = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
