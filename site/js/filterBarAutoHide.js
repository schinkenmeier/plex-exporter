/**
 * Auto-hide filter bar on scroll and when modals are open
 */

const SCROLL_SHOW_THRESHOLD = 50;

let lastScrollY = 0;
let isScrollingDown = false;
let scrollTicking = false;
let filterBar = null;
const supportsInert =
  typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;
const focusableSelectors = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]',
  '[tabindex]'
].join(',');

/**
 * Initialize auto-hide functionality
 */
export function initFilterBarAutoHide() {
  filterBar = document.getElementById('filterBar');
  if (!filterBar) return;

  // Listen to scroll events
  window.addEventListener('scroll', handleScroll, { passive: true });

  // Listen to modal open/close events
  document.addEventListener('modal:open', hideFilterBar);
  document.addEventListener('modal:close', showFilterBar);

  // Listen to settings overlay open/close
  document.addEventListener('settings:open', hideFilterBar);
  document.addEventListener('settings:close', showFilterBar);

  // Listen to watchlist panel open/close
  document.addEventListener('watchlist:open', hideFilterBar);
  document.addEventListener('watchlist:close', showFilterBar);
}

/**
 * Handle scroll events with throttling
 */
function handleScroll() {
  if (!scrollTicking) {
    window.requestAnimationFrame(() => {
      updateFilterBarVisibility();
      scrollTicking = false;
    });
    scrollTicking = true;
  }
}

/**
 * Update filter bar visibility based on scroll position
 */
function updateFilterBarVisibility() {
  const currentScrollY = window.scrollY;

  // Determine scroll direction
  if (currentScrollY > lastScrollY && currentScrollY > SCROLL_SHOW_THRESHOLD) {
    // Scrolling down and past threshold
    if (!isScrollingDown) {
      hideFilterBar();
    }
  } else if (currentScrollY < lastScrollY) {
    // Scrolling up
    if (isScrollingDown && currentScrollY <= SCROLL_SHOW_THRESHOLD) {
      showFilterBar();
    }
  } else if (
    currentScrollY <= SCROLL_SHOW_THRESHOLD &&
    filterBar &&
    filterBar.classList.contains('filters--hidden')
  ) {
    // Handle cases where the bar is hidden but scroll position was reset without
    // triggering a scroll direction change (e.g. scroll-to-top button)
    showFilterBar();
  }

  lastScrollY = currentScrollY;
}

/**
 * Hide the filter bar
 */
function hideFilterBar() {
  if (!filterBar) return;
  isScrollingDown = true;
  lastScrollY = window.scrollY;
  filterBar.classList.add('filters--hidden');
  filterBar.setAttribute('aria-hidden', 'true');
  if (supportsInert) {
    filterBar.setAttribute('inert', ''); // Prevent keyboard focus on hidden elements
  } else {
    disableFilterBarFocus();
  }
}

/**
 * Show the filter bar
 */
function showFilterBar() {
  if (!filterBar) return;

  // Only show if no modal/overlay is open
  const hasOpenModal = document.querySelector('.modalv2-overlay[aria-hidden="false"]');
  const hasOpenSettings = document.querySelector('.settings-overlay[aria-hidden="false"]');
  const hasOpenWatchlist = document.querySelector('.watchlist-panel[aria-hidden="false"]');

  if (hasOpenModal || hasOpenSettings || hasOpenWatchlist) {
    return; // Keep hidden if something is open
  }

  isScrollingDown = false;
  lastScrollY = window.scrollY;
  filterBar.classList.remove('filters--hidden');
  filterBar.setAttribute('aria-hidden', 'false');
  if (supportsInert) {
    filterBar.removeAttribute('inert'); // Re-enable keyboard focus
  } else {
    restoreFilterBarFocus();
  }
}

/**
 * Force show filter bar (useful for testing)
 */
export function forceShowFilterBar() {
  showFilterBar();
}

/**
 * Force hide filter bar (useful for testing)
 */
export function forceHideFilterBar() {
  hideFilterBar();
}

function disableFilterBarFocus() {
  if (!filterBar) return;

  filterBar.querySelectorAll(focusableSelectors).forEach((element) => {
    if (element.dataset.filterBarPrevTabindex !== undefined) return;

    if (element.hasAttribute('tabindex')) {
      element.dataset.filterBarPrevTabindex = element.getAttribute('tabindex');
    } else {
      element.dataset.filterBarPrevTabindex = '';
    }

    element.setAttribute('tabindex', '-1');
  });
}

function restoreFilterBarFocus() {
  if (!filterBar) return;

  filterBar.querySelectorAll(focusableSelectors).forEach((element) => {
    if (element.dataset.filterBarPrevTabindex === undefined) return;

    const previous = element.dataset.filterBarPrevTabindex;
    delete element.dataset.filterBarPrevTabindex;

    if (previous === '') {
      element.removeAttribute('tabindex');
    } else {
      element.setAttribute('tabindex', previous);
    }
  });
}
