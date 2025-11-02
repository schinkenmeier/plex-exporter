import { qs, el } from '../core/dom.js';

function ensureOverlay(rootId) {
  let overlay = qs(`#${rootId}`);
  if (overlay) {
    return overlay;
  }

  overlay = el('div', 'loader-overlay');
  overlay.id = rootId;
  overlay.hidden = true;

  const box = el('div', 'loader');
  const message = el('div', 'msg', '');
  const bar = el('div', 'bar');

  box.append(message, bar);
  overlay.append(box);
  document.body.append(overlay);

  return overlay;
}

export function createLoaderOverlay(rootId = 'loaderOverlay') {
  const overlay = ensureOverlay(rootId);
  const messageEl = overlay.querySelector('.msg');
  const barEl = overlay.querySelector('.bar');

  function setMessage(text) {
    if (messageEl) {
      messageEl.textContent = text || '';
    }
  }

  function setProgress(progress) {
    if (barEl) {
      const value = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : 0;
      barEl.style.width = `${value}%`;
    }
  }

  return {
    element() {
      return overlay;
    },
    show(message) {
      if (message !== undefined) {
        setMessage(message);
      }
      overlay.hidden = false;
    },
    hide() {
      overlay.hidden = true;
    },
    update({ message, progress } = {}) {
      if (message !== undefined) {
        setMessage(message);
      }
      if (progress !== undefined) {
        setProgress(progress);
      }
    }
  };
}
