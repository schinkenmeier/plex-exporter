export interface SectionOptions {
  title: string;
  subtitle?: string;
  description?: string;
  actions?: Array<HTMLElement | null | undefined>;
  body?: Array<HTMLElement | string>;
}

interface InternalOptions extends SectionOptions {
  kind: 'card' | 'panel';
}

export type SectionElement = HTMLElement & { body: HTMLElement };

export const createCard = (options: SectionOptions): SectionElement =>
  createSectionElement({ ...options, kind: 'card' });

export const createPanel = (options: SectionOptions): SectionElement =>
  createSectionElement({ ...options, kind: 'panel' });

function createSectionElement(options: InternalOptions): SectionElement {
  const section = document.createElement('article') as SectionElement;
  section.className = options.kind === 'card' ? 'admin-card' : 'admin-panel';

  const header = document.createElement('header');
  header.className = 'admin-section-header';

  const titleWrapper = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = options.title;
  titleWrapper.appendChild(title);

  if (options.subtitle) {
    const subtitle = document.createElement('span');
    subtitle.className = 'admin-section-subtitle';
    subtitle.textContent = options.subtitle;
    titleWrapper.appendChild(subtitle);
  }

  header.appendChild(titleWrapper);

  if (options.actions?.length) {
    const actions = document.createElement('div');
    actions.className = 'admin-section-actions';
    options.actions
      .filter(Boolean)
      .forEach(action => actions.appendChild(action as HTMLElement));
    header.appendChild(actions);
  }

  section.appendChild(header);

  if (options.description) {
    const description = document.createElement('p');
    description.className = 'admin-section-description';
    description.textContent = options.description;
    section.appendChild(description);
  }

  const body = document.createElement('div');
  body.className = 'admin-section-body';
  section.body = body;

  if (options.body?.length) {
    for (const entry of options.body) {
      if (typeof entry === 'string') {
        const paragraph = document.createElement('p');
        paragraph.textContent = entry;
        body.appendChild(paragraph);
      } else if (entry instanceof HTMLElement) {
        body.appendChild(entry);
      }
    }
  }

  section.appendChild(body);

  return section;
}
