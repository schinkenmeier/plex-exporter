export interface InfoItem {
  label: string;
  value: string;
  hint?: string;
  status?: 'default' | 'success' | 'danger';
}

export function createInfoList(items: InfoItem[]): HTMLElement {
  const list = document.createElement('div');
  list.className = 'admin-info-list';

  if (!items.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'admin-info-empty';
    placeholder.textContent = 'Keine Daten verfügbar.';
    list.appendChild(placeholder);
    return list;
  }

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'admin-info-item';

    const label = document.createElement('span');
    label.className = 'admin-info-label';
    label.textContent = item.label;

    const value = document.createElement('span');
    value.className = 'admin-info-value';
    value.textContent = item.value;

    if (item.status === 'success') {
      value.classList.add('chip', 'chip-success');
    } else if (item.status === 'danger') {
      value.classList.add('chip', 'chip-danger');
    }

    row.append(label, value);
    list.appendChild(row);

    if (item.hint) {
      const hint = document.createElement('p');
      hint.className = 'admin-info-hint';
      hint.textContent = item.hint;
      list.appendChild(hint);
    }
  }

  return list;
}
