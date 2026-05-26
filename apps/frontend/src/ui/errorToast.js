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
  const content = document.createElement('div');
  content.className = 'error-toast-content';

  const icon = document.createElement('div');
  icon.className = 'error-toast-icon';
  icon.textContent = '⚠️';

  const text = document.createElement('div');
  text.className = 'error-toast-text';
  const titleEl = document.createElement('div');
  titleEl.className = 'error-toast-title';
  titleEl.textContent = title ?? '';
  text.appendChild(titleEl);

  if (message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'error-toast-message';
    messageEl.textContent = message;
    text.appendChild(messageEl);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'error-toast-close';
  closeBtn.setAttribute('aria-label', 'Schließen');
  closeBtn.textContent = '×';

  content.append(icon, text, closeBtn);
  toast.appendChild(content);

  closeBtn.addEventListener('click', () => dismissToast(toast));

  return mountToast(toast);
}

export function createRetryableErrorToast({ title, onRetry }) {
  const toast = document.createElement('div');
  toast.className = 'error-toast error-toast-retryable';
  const content = document.createElement('div');
  content.className = 'error-toast-content';

  const icon = document.createElement('div');
  icon.className = 'error-toast-icon';
  icon.textContent = '⚠️';

  const text = document.createElement('div');
  text.className = 'error-toast-text';
  const titleEl = document.createElement('div');
  titleEl.className = 'error-toast-title';
  titleEl.textContent = title ?? '';
  text.appendChild(titleEl);

  const retryBtn = document.createElement('button');
  retryBtn.className = 'error-toast-retry';
  retryBtn.textContent = 'Erneut versuchen';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'error-toast-close';
  closeBtn.setAttribute('aria-label', 'Schließen');
  closeBtn.textContent = '×';

  content.append(icon, text, retryBtn, closeBtn);
  toast.appendChild(content);

  if (retryBtn && typeof onRetry === 'function') {
    retryBtn.addEventListener('click', () => {
      dismissToast(toast);
      Promise.resolve().then(onRetry).catch(err => {
        console.error('[errorToast] Retry handler failed:', err);
      });
    });
  }

  closeBtn.addEventListener('click', () => dismissToast(toast));

  return mountToast(toast);
}

export function clearErrorToasts() {
  const host = ensureContainer();
  host.replaceChildren();
}
