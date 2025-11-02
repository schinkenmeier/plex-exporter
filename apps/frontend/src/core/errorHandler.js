import { createErrorToast, createRetryableErrorToast, dismissToast, clearErrorToasts, getErrorContainer } from '../ui/errorToast.js';

let initialized = false;

export function initErrorHandler() {
  if (initialized) {
    return;
  }

  getErrorContainer();

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showError('Ein unerwarteter Fehler ist aufgetreten', event.reason?.message);
    event.preventDefault();
  });

  window.addEventListener('error', (event) => {
    console.error('Runtime error:', event.error);
    showError('Ein Fehler ist aufgetreten', event.error?.message);
  });

  initialized = true;
}

export function showError(title, message = '', duration = 5000) {
  if (!initialized) {
    initErrorHandler();
  }

  const toast = createErrorToast({ title, message });

  if (duration > 0) {
    setTimeout(() => {
      dismissToast(toast);
    }, duration);
  }

  return toast;
}

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

export function showRetryableError(title, retryFn) {
  if (!initialized) {
    initErrorHandler();
  }

  return createRetryableErrorToast({
    title,
    onRetry: retryFn,
  });
}

export function clearErrors() {
  clearErrorToasts();
}
