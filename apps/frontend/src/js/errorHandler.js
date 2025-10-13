/**
 * Global Error Handler
 * Provides centralized error handling and user feedback
 */

let errorContainer = null;

/**
 * Initialize the error handler
 */
export function initErrorHandler() {
  // Create error container if it doesn't exist
  if (!errorContainer) {
    errorContainer = document.createElement('div');
    errorContainer.id = 'errorContainer';
    errorContainer.className = 'error-container';
    errorContainer.setAttribute('role', 'alert');
    errorContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(errorContainer);
  }

  // Global error handler for unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showError('Ein unerwarteter Fehler ist aufgetreten', event.reason?.message);
    event.preventDefault();
  });

  // Global error handler for runtime errors
  window.addEventListener('error', (event) => {
    console.error('Runtime error:', event.error);
    showError('Ein Fehler ist aufgetreten', event.error?.message);
  });
}

/**
 * Show an error message to the user
 * @param {string} title - Error title
 * @param {string} message - Error message
 * @param {number} duration - Duration in ms (0 = permanent)
 */
export function showError(title, message = '', duration = 5000) {
  if (!errorContainer) initErrorHandler();

  const errorEl = document.createElement('div');
  errorEl.className = 'error-toast';
  errorEl.innerHTML = `
    <div class="error-toast-content">
      <div class="error-toast-icon">⚠️</div>
      <div class="error-toast-text">
        <div class="error-toast-title">${escapeHtml(title)}</div>
        ${message ? `<div class="error-toast-message">${escapeHtml(message)}</div>` : ''}
      </div>
      <button class="error-toast-close" aria-label="Schließen">×</button>
    </div>
  `;

  const closeBtn = errorEl.querySelector('.error-toast-close');
  closeBtn.addEventListener('click', () => {
    errorEl.classList.add('error-toast-exit');
    setTimeout(() => errorEl.remove(), 300);
  });

  errorContainer.appendChild(errorEl);

  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      if (errorEl.parentNode) {
        errorEl.classList.add('error-toast-exit');
        setTimeout(() => errorEl.remove(), 300);
      }
    }, duration);
  }

  // Animate in
  requestAnimationFrame(() => {
    errorEl.classList.add('error-toast-show');
  });

  return errorEl;
}

/**
 * Wrap an async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} errorTitle - Error title to show on failure
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, errorTitle = 'Ein Fehler ist aufgetreten') {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(`[${errorTitle}]`, error);
      showError(errorTitle, error.message);
      throw error;
    }
  };
}

/**
 * Show a loading error with retry option
 * @param {string} title - Error title
 * @param {Function} retryFn - Function to call on retry
 */
export function showRetryableError(title, retryFn) {
  if (!errorContainer) initErrorHandler();

  const errorEl = document.createElement('div');
  errorEl.className = 'error-toast error-toast-retryable';
  errorEl.innerHTML = `
    <div class="error-toast-content">
      <div class="error-toast-icon">⚠️</div>
      <div class="error-toast-text">
        <div class="error-toast-title">${escapeHtml(title)}</div>
      </div>
      <button class="error-toast-retry">Erneut versuchen</button>
      <button class="error-toast-close" aria-label="Schließen">×</button>
    </div>
  `;

  const retryBtn = errorEl.querySelector('.error-toast-retry');
  const closeBtn = errorEl.querySelector('.error-toast-close');

  retryBtn.addEventListener('click', async () => {
    errorEl.remove();
    try {
      await retryFn();
    } catch (err) {
      console.error('Retry failed:', err);
    }
  });

  closeBtn.addEventListener('click', () => {
    errorEl.classList.add('error-toast-exit');
    setTimeout(() => errorEl.remove(), 300);
  });

  errorContainer.appendChild(errorEl);

  requestAnimationFrame(() => {
    errorEl.classList.add('error-toast-show');
  });

  return errorEl;
}

/**
 * Clear all error messages
 */
export function clearErrors() {
  if (errorContainer) {
    errorContainer.innerHTML = '';
  }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
