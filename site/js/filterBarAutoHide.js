/**
 * Auto-hide filter bar on scroll and when modals are open
 */

let lastScrollY = 0;
let isScrollingDown = false;
let scrollTicking = false;
let filterBar = null;

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
  if (currentScrollY > lastScrollY && currentScrollY > 100) {
    // Scrolling down and past threshold
    if (!isScrollingDown) {
      isScrollingDown = true;
      hideFilterBar();
    }
  } else if (currentScrollY < lastScrollY) {
    // Scrolling up
    if (isScrollingDown) {
      isScrollingDown = false;
      showFilterBar();
    }
  }

  lastScrollY = currentScrollY;
}

/**
 * Hide the filter bar
 */
function hideFilterBar() {
  if (!filterBar) return;
  filterBar.classList.add('filters--hidden');
  filterBar.setAttribute('aria-hidden', 'true');
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

  filterBar.classList.remove('filters--hidden');
  filterBar.setAttribute('aria-hidden', 'false');
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
