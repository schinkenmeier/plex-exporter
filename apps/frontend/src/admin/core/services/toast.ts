export type ToastVariant = 'info' | 'success' | 'error';

interface ToastOptions {
  timeout?: number;
}

export interface ToastService {
  show(message: string, variant?: ToastVariant, options?: ToastOptions): void;
}

const CONTAINER_ID = 'admin-toast-root';

export function createToastService(): ToastService {
  const container = ensureContainer();

  const show = (message: string, variant: ToastVariant = 'info', options?: ToastOptions) => {
    const toast = document.createElement('div');
    toast.className = `admin-toast admin-toast-${variant}`;
    toast.textContent = message;

    container.appendChild(toast);

    const timeout = options?.timeout ?? 3_000;
    window.setTimeout(() => {
      toast.classList.add('hide');
      window.setTimeout(() => toast.remove(), 250);
    }, timeout);
  };

  return { show };
}

function ensureContainer(): HTMLElement {
  let node = document.getElementById(CONTAINER_ID);
  if (!node) {
    node = document.createElement('div');
    node.id = CONTAINER_ID;
    node.className = 'admin-toast-container';
    document.body.appendChild(node);
  }
  return node;
}
