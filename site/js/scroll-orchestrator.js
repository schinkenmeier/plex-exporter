/**
 * Scroll Orchestrator – Progressive Hero → Filterbar → Grid State Machine
 *
 * Manages smooth, jank-free transitions between three states:
 * 1. has-hero: Hero visible, filterbar below hero
 * 2. hero-hidden: Hero collapsed, filterbar sticky under header
 * 3. filters-hidden: Both hidden, only header visible, grid maximized
 *
 * Respects:
 * - prefers-reduced-motion (OS & user toggle)
 *   → disables hero/filter auto-hide to keep layout stable
 * - Focus safety (no hiding while interacting with filterbar)
 * - Advanced filters state (no auto-hide when open)
 * - Scroll direction (reverse transitions on scroll up)
 */

// State constants
const STATE = {
  HAS_HERO: 'has-hero',
  HERO_HIDDEN: 'hero-hidden',
  FILTERS_HIDDEN: 'filters-hidden'
};

// Thresholds
const HERO_HIDE_THRESHOLD = 50; // px from top – hero hides instantly
const FILTERS_HIDE_THRESHOLD = 200; // Additional scroll after hero hidden

// Animation config
const EASE_UI = 'cubic-bezier(0.18, 0.67, 0.32, 1)';
const DUR_UI = 360; // ms

export function initScrollOrchestrator({
  heroEl,
  filterEl,
  headerEl,
  mainEl,
  advancedToggle,
  advancedPanel,
  reduceMotionFlag = false
}) {
  if (!heroEl || !filterEl) {
    console.warn('[scroll-orchestrator] Missing required elements');
    return null;
  }

  // Internal state
  let currentState = STATE.HAS_HERO;
  let lastScrollY = 0;
  let scrollDirection = 'down';
  let heroHeight = 0;
  let filterHeight = 0;
  let isFilterbarInteractive = false;
  let shouldReduceMotion = !!reduceMotionFlag;
  let userReduceMotionPref = !!reduceMotionFlag;
  let systemReduceMotionPref = false;
  let scrollTicking = false;
  let intersectionObserver = null;
  let resizeObserver = null;
  let heroTransitionHandler = null;
  let heroTransitionMode = null; // 'collapsing' | 'expanding'
  let previousNonReducedState = STATE.HAS_HERO;

  // Focus selectors for interaction detection
  const focusableSelectors = [
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  /**
   * Initialize – measure, setup observers, bind events
   */
  function init() {
    // Set CSS variables for easing/duration
    document.documentElement.style.setProperty('--ease-ui', EASE_UI);
    document.documentElement.style.setProperty('--dur-ui', `${DUR_UI}ms`);

    // Measure initial heights
    measureHeights();

    // Set initial state
    applyState(STATE.HAS_HERO, true);

    // Setup IntersectionObserver for hero threshold
    setupIntersectionObserver();

    // Listen to scroll
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Listen to resize/orientation change
    setupResizeObserver();

    // Listen to filterbar interaction
    setupFilterbarInteraction();

    // Listen to advanced panel state
    setupAdvancedPanelWatcher();

    // Detect reduced motion changes
    setupMotionDetection();

    console.log('[scroll-orchestrator] Initialized', {
      heroHeight,
      filterHeight,
      reduceMotion: shouldReduceMotion
    });
  }

  /**
   * Measure element heights and cache them
   */
  function measureHeights() {
    if (heroEl) {
      heroHeight = heroEl.scrollHeight || heroEl.offsetHeight || 0;
      document.documentElement.style.setProperty('--hero-h', `${heroHeight}px`);
    }
    if (filterEl) {
      filterHeight = filterEl.scrollHeight || filterEl.offsetHeight || 0;
      document.documentElement.style.setProperty('--filters-h', `${filterHeight}px`);
    }
  }

  /**
   * Setup IntersectionObserver to detect when hero leaves viewport
   */
  function setupIntersectionObserver() {
    if (!('IntersectionObserver' in window)) {
      console.warn('[scroll-orchestrator] IntersectionObserver not supported, using fallback');
      return;
    }

    // Observer for when hero top edge passes threshold
    intersectionObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          // Hero is leaving viewport (scrolling down past threshold)
          if (!entry.isIntersecting && scrollDirection === 'down') {
            if (currentState === STATE.HAS_HERO) {
              transitionToState(STATE.HERO_HIDDEN);
            }
          }
          // Hero is entering viewport (scrolling up)
          else if (entry.isIntersecting && scrollDirection === 'up') {
            if (currentState === STATE.HERO_HIDDEN || currentState === STATE.FILTERS_HIDDEN) {
              transitionToState(STATE.HAS_HERO);
            }
          }
        });
      },
      {
        rootMargin: `-${HERO_HIDE_THRESHOLD}px 0px 0px 0px`,
        threshold: 0
      }
    );

    intersectionObserver.observe(heroEl);
  }

  /**
   * Setup ResizeObserver to invalidate cached heights
   */
  function setupResizeObserver() {
    if (!('ResizeObserver' in window)) {
      // Fallback to window resize event
      window.addEventListener('resize', () => {
        requestAnimationFrame(measureHeights);
      }, { passive: true });
      return;
    }

    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(measureHeights);
    });

    if (heroEl) resizeObserver.observe(heroEl);
    if (filterEl) resizeObserver.observe(filterEl);
  }

  /**
   * Detect filterbar interaction (focus, input)
   */
  function setupFilterbarInteraction() {
    if (!filterEl) return;

    let interactionTimeout = null;

    const clearInteraction = () => {
      if (interactionTimeout) {
        clearTimeout(interactionTimeout);
        interactionTimeout = null;
      }
    };

    const updateInteractionState = () => {
      const hasActiveFocus = filterEl.contains(document.activeElement);
      if (!hasActiveFocus) {
        isFilterbarInteractive = false;
      }
    };

    // Track focus in/out
    filterEl.addEventListener('focusin', () => {
      clearInteraction();
      isFilterbarInteractive = true;
    });

    filterEl.addEventListener('focusout', () => {
      clearInteraction();
      // Delay to allow focus to settle
      interactionTimeout = setTimeout(updateInteractionState, 100);
    });

    // Track input/change events (search, selects)
    filterEl.addEventListener('input', () => {
      clearInteraction();
      isFilterbarInteractive = true;
      // Auto-release after 1.5s of no activity
      interactionTimeout = setTimeout(() => {
        if (!filterEl.contains(document.activeElement)) {
          isFilterbarInteractive = false;
        }
      }, 1500);
    });

    // Track change events (select dropdowns)
    filterEl.addEventListener('change', () => {
      clearInteraction();
      isFilterbarInteractive = true;
      // Auto-release after 1.5s
      interactionTimeout = setTimeout(() => {
        if (!filterEl.contains(document.activeElement)) {
          isFilterbarInteractive = false;
        }
      }, 1500);
    });
  }

  /**
   * Watch advanced panel state to prevent auto-hide
   */
  function setupAdvancedPanelWatcher() {
    if (!advancedPanel) return;

    // MutationObserver to watch data-state changes
    const observer = new MutationObserver(() => {
      const panelState = advancedPanel.dataset.state || 'closed';
      const isOpen = panelState === 'open' || panelState === 'expanding';

      // If advanced is open, revert to hero-hidden if we're at filters-hidden
      if (isOpen && currentState === STATE.FILTERS_HIDDEN) {
        transitionToState(STATE.HERO_HIDDEN);
      }
    });

    observer.observe(advancedPanel, {
      attributes: true,
      attributeFilter: ['data-state']
    });
  }

  /**
   * Detect reduced motion preference changes
   */
  function setupMotionDetection() {
    if (!('matchMedia' in window)) {
      syncReduceMotionMode(true);
      return;
    }

    // Media query
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPref = event => {
      systemReduceMotionPref = event.matches;
      syncReduceMotionMode();
    };

    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', updateMotionPref);
    } else if (motionQuery.addListener) {
      motionQuery.addListener(updateMotionPref);
    }

    systemReduceMotionPref = motionQuery.matches;
    syncReduceMotionMode(true);
  }

  /**
   * Handle scroll events (throttled via RAF)
   */
  function handleScroll() {
    if (scrollTicking) return;

    scrollTicking = true;
    requestAnimationFrame(() => {
      updateScrollState();
      scrollTicking = false;
    });
  }

  /**
   * Update scroll state – direction, position, transitions
   */
  function updateScrollState() {
    const currentScrollY = window.scrollY || window.pageYOffset || 0;

    // Determine scroll direction
    if (currentScrollY > lastScrollY) {
      scrollDirection = 'down';
    } else if (currentScrollY < lastScrollY) {
      scrollDirection = 'up';
    }

    lastScrollY = currentScrollY;

    if (shouldReduceMotion) {
      if (currentState !== STATE.HAS_HERO) {
        currentState = STATE.HAS_HERO;
        applyState(STATE.HAS_HERO, true);
      }
      return;
    }

    // State transitions based on scroll position & direction
    let previousState;
    let iterations = 0;

    do {
      previousState = currentState;

      if (scrollDirection === 'down') {
        handleScrollDown(currentScrollY);
      } else {
        handleScrollUp(currentScrollY);
      }

      iterations += 1;
    } while (previousState !== currentState && iterations < 3);
  }

  /**
   * Handle downward scroll transitions
   */
  function handleScrollDown(scrollY) {
    // Transition: has-hero → hero-hidden (instant when past threshold)
    if (currentState === STATE.HAS_HERO && scrollY >= HERO_HIDE_THRESHOLD) {
      transitionToState(STATE.HERO_HIDDEN);
    }
    // Transition: hero-hidden → filters-hidden
    else if (currentState === STATE.HERO_HIDDEN) {
      const filterThreshold = HERO_HIDE_THRESHOLD + FILTERS_HIDE_THRESHOLD;
      const canHideFilters = !isFilterbarInteractive && !isAdvancedOpen();

      if (scrollY >= filterThreshold && canHideFilters) {
        transitionToState(STATE.FILTERS_HIDDEN);
      }
    }
  }

  /**
   * Handle upward scroll transitions (reverse order)
   */
  function handleScrollUp(scrollY) {
    // Transition: filters-hidden → hero-hidden
    if (currentState === STATE.FILTERS_HIDDEN) {
      const filterThreshold = HERO_HIDE_THRESHOLD + FILTERS_HIDE_THRESHOLD;
      if (scrollY < filterThreshold - 80) { // 80px hysteresis
        transitionToState(STATE.HERO_HIDDEN);
      }
    }
    // Transition: hero-hidden → has-hero
    else if (currentState === STATE.HERO_HIDDEN) {
      if (scrollY < HERO_HIDE_THRESHOLD - 20) { // 20px hysteresis
        transitionToState(STATE.HAS_HERO);
      }
    }
  }

  /**
   * Transition to a new state
   */
  function transitionToState(newState) {
    if (currentState === newState) return;

    console.log(`[scroll-orchestrator] Transition: ${currentState} → ${newState}`);
    currentState = newState;
    if (!shouldReduceMotion) {
      previousNonReducedState = newState;
    }
    applyState(newState);
  }

  function detachHeroTransitionHandler() {
    if (heroTransitionHandler && heroEl) {
      heroEl.removeEventListener('transitionend', heroTransitionHandler);
      heroEl.removeEventListener('transitioncancel', heroTransitionHandler);
    }
    heroTransitionHandler = null;
  }

  function clearHeroTransition() {
    detachHeroTransitionHandler();
    heroTransitionMode = null;
  }

  function completeHeroTransition() {
    if (!heroTransitionMode) {
      detachHeroTransitionHandler();
      return;
    }

    const mode = heroTransitionMode;
    detachHeroTransitionHandler();
    heroTransitionMode = null;

    if (mode === 'expanding') {
      if (heroEl) {
        heroEl.classList.remove('is-collapsing');
        heroEl.removeAttribute('aria-hidden');
      }

      if (filterEl) {
        filterEl.classList.remove('is-collapsing', 'is-sticky', 'is-hidden');
        filterEl.removeAttribute('aria-hidden');
        removeInert(filterEl);
      }
    } else if (mode === 'collapsing') {
      if (heroEl) {
        heroEl.classList.remove('is-collapsing');
        heroEl.classList.add('is-hidden');
        heroEl.setAttribute('aria-hidden', 'true');
      }

      if (filterEl) {
        filterEl.classList.remove('is-collapsing');
        filterEl.classList.add('is-sticky');
        filterEl.removeAttribute('aria-hidden');
        removeInert(filterEl);
      }
    }
  }

  /**
   * Apply body classes and element states for current state
   */
  function applyState(state, skipAnimation = false) {
    const body = document.body;

    // Remove all state classes
    body.classList.remove(STATE.HAS_HERO, STATE.HERO_HIDDEN, STATE.FILTERS_HIDDEN);

    // Add current state class
    body.classList.add(state);

    // Apply element-specific states
    switch (state) {
      case STATE.HAS_HERO:
        applyHasHeroState(skipAnimation);
        break;
      case STATE.HERO_HIDDEN:
        applyHeroHiddenState(skipAnimation);
        break;
      case STATE.FILTERS_HIDDEN:
        applyFiltersHiddenState(skipAnimation);
        break;
    }
  }

  /**
   * State: has-hero (hero visible, filterbar normal)
   */
  function applyHasHeroState(skipAnimation) {
    clearHeroTransition();

    let heroWillAnimate = false;

    if (heroEl) {
      heroWillAnimate =
        (heroEl.classList.contains('is-hidden') || heroEl.classList.contains('is-collapsing')) &&
        !skipAnimation &&
        !shouldReduceMotion;

      heroEl.classList.remove('is-hidden', 'is-collapsing');
      // Clear any inline styles
      heroEl.style.opacity = '';
      heroEl.style.transform = '';

      if (heroWillAnimate) {
        heroTransitionMode = 'expanding';

        heroTransitionHandler = event => {
          if (!heroEl || event.target !== heroEl || event.propertyName !== 'max-height') {
            return;
          }

          completeHeroTransition();
        };

        heroEl.addEventListener('transitionend', heroTransitionHandler);
        heroEl.addEventListener('transitioncancel', heroTransitionHandler);

        requestAnimationFrame(() => {
          if (heroTransitionMode !== 'expanding' || !heroEl) return;
          void heroEl.offsetHeight;
        });
      } else {
        heroEl.removeAttribute('aria-hidden');
      }
    }

    if (filterEl) {
      filterEl.classList.remove('is-hidden', 'is-collapsing');
      filterEl.removeAttribute('aria-hidden');
      removeInert(filterEl);

      if (heroWillAnimate) {
        filterEl.classList.add('is-collapsing');
      } else {
        filterEl.classList.remove('is-sticky');
      }
    }
  }

  /**
   * State: hero-hidden (hero collapsed, filterbar sticky)
   */
  function applyHeroHiddenState(skipAnimation) {
    clearHeroTransition();

    let heroWillAnimate = false;

    if (heroEl) {
      heroWillAnimate = !skipAnimation && !shouldReduceMotion && !heroEl.classList.contains('is-hidden');

      // Clear any inline styles
      heroEl.style.opacity = '';
      heroEl.style.transform = '';

      if (heroWillAnimate) {
        heroTransitionMode = 'collapsing';

        if (filterEl) {
          filterEl.classList.remove('is-hidden', 'is-sticky');
          filterEl.classList.add('is-collapsing');
          filterEl.removeAttribute('aria-hidden');
          removeInert(filterEl);
        }

        heroTransitionHandler = event => {
          if (!heroEl || event.target !== heroEl || event.propertyName !== 'max-height') {
            return;
          }

          completeHeroTransition();
        };

        heroEl.addEventListener('transitionend', heroTransitionHandler);
        heroEl.addEventListener('transitioncancel', heroTransitionHandler);

        heroEl.classList.remove('is-hidden', 'is-collapsing');

        requestAnimationFrame(() => {
          if (heroTransitionMode !== 'collapsing' || !heroEl) return;
          heroEl.classList.add('is-collapsing');
        });
      } else {
        heroEl.classList.add('is-hidden');
        heroEl.classList.remove('is-collapsing');
        heroEl.setAttribute('aria-hidden', 'true');
      }
    }

    if (filterEl) {
      if (!heroWillAnimate) {
        filterEl.classList.remove('is-hidden', 'is-collapsing');
        filterEl.classList.add('is-sticky');
        filterEl.removeAttribute('aria-hidden');
        removeInert(filterEl);
      }
    }
  }

  /**
   * State: filters-hidden (both hidden, grid maximized)
   */
  function applyFiltersHiddenState(skipAnimation) {
    clearHeroTransition();

    if (heroEl) {
      heroEl.classList.add('is-hidden');
      heroEl.classList.remove('is-collapsing');
      heroEl.setAttribute('aria-hidden', 'true');
      heroEl.style.opacity = '0';
      heroEl.style.transform = '';
    }

    if (filterEl) {
      filterEl.classList.add('is-hidden');
      filterEl.classList.remove('is-sticky', 'is-collapsing');
      filterEl.setAttribute('aria-hidden', 'true');

      // Clear focus if inside filterbar
      if (filterEl.contains(document.activeElement)) {
        document.activeElement.blur();
      }

      setInert(filterEl);
    }
  }

  /**
   * Check if advanced filters panel is open
   */
  function isAdvancedOpen() {
    if (!advancedPanel) return false;
    const state = advancedPanel.dataset.state || 'closed';
    return state === 'open' || state === 'expanding';
  }

  /**
   * Set inert attribute (prevent focus)
   */
  function setInert(element) {
    if (!element) return;
    if ('inert' in HTMLElement.prototype) {
      element.inert = true;
    } else {
      // Fallback: set tabindex=-1 on all focusable elements
      element.querySelectorAll(focusableSelectors).forEach(el => {
        if (!el.dataset.originalTabindex) {
          el.dataset.originalTabindex = el.getAttribute('tabindex') || '';
        }
        el.setAttribute('tabindex', '-1');
      });
    }
  }

  /**
   * Remove inert attribute
   */
  function removeInert(element) {
    if (!element) return;
    if ('inert' in HTMLElement.prototype) {
      element.inert = false;
    } else {
      // Restore original tabindex
      element.querySelectorAll(focusableSelectors).forEach(el => {
        const original = el.dataset.originalTabindex;
        if (original !== undefined) {
          if (original === '') {
            el.removeAttribute('tabindex');
          } else {
            el.setAttribute('tabindex', original);
          }
          delete el.dataset.originalTabindex;
        }
      });
    }
  }

  /**
   * Public API: Force state (for settings toggle)
   */
  function setEnabled(enabled) {
    if (!enabled) {
      // Disable orchestration – revert to has-hero
      transitionToState(STATE.HAS_HERO);
      window.removeEventListener('scroll', handleScroll);
      if (intersectionObserver) {
        intersectionObserver.disconnect();
      }
    } else {
      // Re-enable
      window.addEventListener('scroll', handleScroll, { passive: true });
      if (intersectionObserver && heroEl) {
        intersectionObserver.observe(heroEl);
      }
      // Re-evaluate state based on current scroll
      updateScrollState();
    }
  }

  /**
   * Public API: Update reduce motion flag
   */
  function syncReduceMotionMode(forceReset = false) {
    const nextReduceMotion = systemReduceMotionPref || userReduceMotionPref;
    const modeChanged = nextReduceMotion !== shouldReduceMotion;

    shouldReduceMotion = nextReduceMotion;
    document.body.classList.toggle('reduce-motion', shouldReduceMotion);

    if (shouldReduceMotion) {
      previousNonReducedState = currentState;
      completeHeroTransition();
      currentState = STATE.HAS_HERO;
      applyState(STATE.HAS_HERO, true);
      lastScrollY = window.scrollY || window.pageYOffset || 0;
    } else {
      if (previousNonReducedState) {
        currentState = previousNonReducedState;
      }
      if (forceReset || modeChanged) {
        applyState(currentState, true);
      }
      lastScrollY = window.scrollY || window.pageYOffset || 0;
      updateScrollState();
    }
  }

  function setReduceMotion(reduce) {
    userReduceMotionPref = !!reduce;
    syncReduceMotionMode(true);
  }

  /**
   * Public API: Get current state
   */
  function getState() {
    return currentState;
  }

  // Initialize on load
  init();

  // Return public API
  return {
    setEnabled,
    setReduceMotion,
    getState
  };
}
