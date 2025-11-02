/**
 * SimpleGrid - Modern grid with automatic infinite scroll
 *
 * Uses modern browser features:
 * - Intersection Observer for efficient load triggering
 * - CSS content-visibility for rendering optimization
 * - All loaded items stay in DOM (browser optimizes offscreen rendering)
 *
 * Perfect for manageable item counts (<5000 items)
 */

export class SimpleGrid {
  constructor(container, options = {}) {
    if (!container) throw new Error('SimpleGrid requires a container element');

    this.container = container;
    this.renderItem = options.renderItem || (() => null);
    this.onLoadMore = options.onLoadMore || null;
    this.getKey = options.getKey || ((item, index) => item?.id || `item-${index}`);

    this.items = [];
    this.hasMore = true;
    this.renderedKeys = new Set();

    this.setupSentinel();
  }

  setupSentinel() {
    // Create sentinel element for infinite scroll trigger
    this.sentinel = document.createElement('div');
    this.sentinel.className = 'grid__sentinel';
    this.sentinel.setAttribute('aria-hidden', 'true');
    Object.assign(this.sentinel.style, {
      height: '1px',
      width: '100%',
      pointerEvents: 'none',
      gridColumn: '1 / -1' // Span all columns
    });

    // Intersection Observer to trigger loading before reaching bottom
    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && this.hasMore && this.onLoadMore) {
          this.onLoadMore();
        }
      },
      {
        root: null,
        rootMargin: '800px', // Trigger 800px before sentinel enters viewport
        threshold: 0
      }
    );
  }

  setItems(newItems, hasMore = true) {
    if (!Array.isArray(newItems)) {
      console.warn('[SimpleGrid] setItems received non-array:', newItems);
      return;
    }

    this.hasMore = hasMore;

    // Detect if this is a filter change (fewer items than before)
    const isFilterChange = newItems.length < this.items.length;

    if (isFilterChange) {
      // Clear everything on filter change
      this.clear();
    }

    // Find new items to render
    const startIndex = this.items.length;
    const itemsToAdd = newItems.slice(startIndex);

    if (itemsToAdd.length === 0 && !isFilterChange) {
      return; // No new items to add
    }

    // Update items array
    this.items = newItems;

    // Render new items
    if (itemsToAdd.length > 0) {
      this.renderNewItems(itemsToAdd, startIndex);
    }

    // Update sentinel position
    this.updateSentinel();
  }

  renderNewItems(items, startIndex) {
    // Batch DOM updates using DocumentFragment
    const fragment = document.createDocumentFragment();

    items.forEach((item, index) => {
      const actualIndex = startIndex + index;
      const key = this.getKey(item, actualIndex);

      // Skip if already rendered (shouldn't happen, but safety check)
      if (this.renderedKeys.has(key)) return;

      const node = this.renderItem(item, actualIndex);

      if (node instanceof HTMLElement) {
        // Add data attribute for debugging
        node.dataset.gridIndex = actualIndex;
        node.dataset.gridKey = key;

        fragment.appendChild(node);
        this.renderedKeys.add(key);
      }
    });

    // Single DOM operation - fast!
    this.container.appendChild(fragment);
  }

  updateSentinel() {
    // Remove old sentinel
    if (this.sentinel.parentNode) {
      this.observer.unobserve(this.sentinel);
      this.sentinel.remove();
    }

    // Add sentinel back at the end if there are more items to load
    if (this.hasMore) {
      this.container.appendChild(this.sentinel);
      this.observer.observe(this.sentinel);
    }
  }

  clear() {
    // Clear container
    this.container.innerHTML = '';
    this.items = [];
    this.renderedKeys.clear();

    // Stop observing
    if (this.sentinel.parentNode) {
      this.observer.unobserve(this.sentinel);
    }
  }

  destroy() {
    this.observer?.disconnect();
    this.clear();
  }

  // Utility method to get current state
  getState() {
    return {
      itemCount: this.items.length,
      hasMore: this.hasMore,
      renderedCount: this.renderedKeys.size
    };
  }
}
