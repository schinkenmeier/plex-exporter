import { createState } from './state.ts';
import { adminViews } from '../views/index.ts';
import { createToastService } from './services/toast.ts';
import { createLoaderService } from './services/loader.ts';

const APP_CLASS = 'admin-app-shell';
const VIEW_CONTAINER_ID = 'admin-view-root';
const NAV_BUTTON_CLASS = 'admin-nav-button';

export async function bootstrapAdminApp(): Promise<void> {
  const root = document.getElementById('admin-root');
  if (!root) {
    console.error('[admin] container #admin-root nicht gefunden');
    return;
  }

  const state = createState();
  const toast = createToastService();
  const loader = createLoaderService();
  const layout = createBaseLayout();
  root.replaceChildren(layout.shell);

  const viewContainer = layout.viewContainer;

  const views = adminViews.map(view => ({ ...view }));
  let activeViewId: string | null = null;
  let activeTeardown: (() => void | Promise<void>) | null = null;

  const switchView = async (targetId: string): Promise<void> => {
    if (targetId === activeViewId) return;
    const nextView = views.find(view => view.id === targetId);
    if (!nextView) {
      console.warn('[admin] unbekannter View:', targetId);
      return;
    }

    layout.updateActiveNav(targetId);
    if (typeof activeTeardown === 'function') {
      await Promise.resolve(activeTeardown());
    }

    viewContainer.replaceChildren();
    const teardown = await Promise.resolve(
      nextView.mount({
        container: viewContainer,
        state,
        toast,
        loader,
      }),
    );
    activeViewId = nextView.id;
    activeTeardown = typeof teardown === 'function' ? teardown : null;
  };

  layout.navButtons.forEach(button => {
    button.addEventListener('click', () => switchView(button.dataset.view || ''));
  });

  await switchView(state.currentView);
}

function createBaseLayout() {
  const shell = document.createElement('div');
  shell.className = APP_CLASS;

  shell.innerHTML = `
    <aside class="admin-sidebar">
      <div class="admin-brand">
        <h1>Plex Exporter</h1>
        <p>Admin Console</p>
      </div>
      <nav class="admin-nav" data-role="navigation"></nav>
    </aside>
    <main class="admin-main">
      <header class="admin-header">
        <div>
          <h2 id="admin-view-title">Admin Dashboard</h2>
          <p id="admin-view-description">Systemübersicht & Werkzeuge</p>
        </div>
      </header>
      <section id="${VIEW_CONTAINER_ID}" class="admin-view-container"></section>
    </main>
  `;

  const nav = shell.querySelector('[data-role="navigation"]');
  if (!nav) throw new Error('navigation element missing');

  const navButtons: HTMLButtonElement[] = [];
  for (const view of adminViews) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = view.label;
    button.className = NAV_BUTTON_CLASS;
    button.dataset.view = view.id;
    nav.appendChild(button);
    navButtons.push(button);
  }

  const viewContainer = shell.querySelector(`#${VIEW_CONTAINER_ID}`) as HTMLElement |
    null;
  if (!viewContainer) {
    throw new Error('view container missing');
  }

  const updateActiveNav = (viewId: string): void => {
    navButtons.forEach(button => {
      const isActive = button.dataset.view === viewId;
      button.classList.toggle('active', isActive);
    });
    const meta = adminViews.find(view => view.id === viewId);
    const titleEl = shell.querySelector('#admin-view-title');
    const descriptionEl = shell.querySelector('#admin-view-description');
    if (titleEl && meta) titleEl.textContent = meta.title;
    if (descriptionEl && meta) descriptionEl.textContent = meta.description;
  };

  return { shell, viewContainer, navButtons, updateActiveNav };
}
