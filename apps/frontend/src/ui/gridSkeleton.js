import { qs, el } from '../core/dom.js';

export function createGridSkeleton(selector = '#grid') {
  let skeletonRoot = null;

  function resolveHost() {
    return qs(selector);
  }

  return {
    show(count = 18) {
      const host = resolveHost();
      if (!host) return;
      skeletonRoot = el('div', 'skeleton');
      for (let i = 0; i < count; i += 1) {
        skeletonRoot.append(el('div', 'skel'));
      }
      host.replaceChildren(skeletonRoot);
    },
    clear() {
      if (skeletonRoot?.parentElement) {
        skeletonRoot.parentElement.removeChild(skeletonRoot);
      }
      skeletonRoot = null;
    }
  };
}
