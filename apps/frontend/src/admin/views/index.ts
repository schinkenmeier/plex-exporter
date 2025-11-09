import type { AdminState } from '../core/state.ts';
import type { ToastService } from '../core/services/toast.ts';
import type { LoaderHandle } from '../core/services/loader.ts';
import { createCard } from '../components/card.ts';
import { dashboardView } from './dashboard/index.ts';
import { configView } from './config/index.ts';
import { logsView } from './logs/index.ts';
import { databaseView } from './database/index.ts';
import { tautulliView } from './tautulli/index.ts';
import { diagnosticsView } from './diagnostics/index.ts';

export interface ViewContext {
  container: HTMLElement;
  state: AdminState;
  toast: ToastService;
  loader: LoaderHandle;
}

export interface AdminViewModule {
  id: string;
  label: string;
  title: string;
  description: string;
  mount(context: ViewContext): void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>;
}

const createPlaceholder = (title: string, body: string): HTMLElement => {
  const card = createCard({ title, description: body });
  return card;
};

const placeholderView = (config: {
  id: string;
  label: string;
  title: string;
  description: string;
  body: string;
}): AdminViewModule => ({
  ...config,
  mount: ({ container }) => {
    container.appendChild(createPlaceholder(config.title, config.body));
  }
});

export const adminViews: AdminViewModule[] = [
  dashboardView,
  configView,
  logsView,
  databaseView,
  tautulliView,
  diagnosticsView
];
