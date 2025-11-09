export interface LoaderHandle {
  show(target?: HTMLElement, text?: string): HTMLElement;
  hide(spinner: HTMLElement): void;
  wrap<T>(target: HTMLElement, task: () => Promise<T> | T, text?: string): Promise<T>;
}

export function createLoaderService(): LoaderHandle {
  const show = (target?: HTMLElement, text = 'Lädt...'): HTMLElement => {
    const spinner = document.createElement('div');
    spinner.className = 'admin-loader';
    spinner.innerHTML = `<span class="admin-loader-spinner" aria-hidden="true"></span><span>${text}</span>`;

    if (target) {
      spinner.classList.add('admin-loader-inline');
      target.appendChild(spinner);
    } else {
      document.body.appendChild(spinner);
    }

    return spinner;
  };

  const hide = (spinner: HTMLElement): void => {
    if (!spinner?.parentElement) return;
    spinner.classList.add('hide');
    window.setTimeout(() => spinner.remove(), 120);
  };

  const wrap = async <T>(target: HTMLElement, task: () => Promise<T> | T, text?: string): Promise<T> => {
    const spinner = show(target, text);
    try {
      return await task();
    } finally {
      hide(spinner);
    }
  };

  return { show, hide, wrap };
}
