export function formatSourceLabel(source) {
  switch (source) {
    case 'env':
      return 'Environment';
    case 'tautulli_config':
      return 'Datenbank';
    case 'legacy_settings':
      return 'Legacy-Fallback';
    default:
      return 'Nicht gesetzt';
  }
}

export function formatConfigStatus(config) {
  if (!config.configured) {
    return 'Keine aktive Tautulli-Konfiguration vorhanden.';
  }
  const active = formatSourceLabel(config.activeSource);
  const apiKey = config.hasApiKey ? 'API-Key ist gesetzt' : 'API-Key fehlt';
  return `Aktiv: ${active}. ${apiKey}.`;
}

function appendSummaryRow(container, label, value) {
  const row = document.createElement('div');
  row.className = 'tautulli-config-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'admin-muted-text';
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  container.appendChild(row);
}

function appendSummaryChip(container, label, variant) {
  const chip = document.createElement('span');
  chip.className = 'admin-chip';
  if (variant === 'success') chip.classList.add('admin-chip-success');
  if (variant === 'warning') chip.classList.add('admin-chip-warning');
  if (variant === 'danger') chip.classList.add('admin-chip-danger');
  chip.textContent = label;
  container.appendChild(chip);
}

export function renderConfigSummary(container, config) {
  container.innerHTML = '';
  const saved = config.saved ?? { source: 'unset', tautulliUrl: null, hasApiKey: false };

  const chipRow = document.createElement('div');
  chipRow.className = 'admin-button-row';
  appendSummaryChip(
    chipRow,
    `Aktiv: ${formatSourceLabel(config.activeSource)}`,
    config.configured ? 'success' : 'danger',
  );
  if (saved.source !== 'unset') {
    appendSummaryChip(chipRow, `Gespeichert: ${formatSourceLabel(saved.source)}`);
  }
  if (config.envOverride) {
    appendSummaryChip(chipRow, 'ENV-Override', 'warning');
  }
  container.appendChild(chipRow);

  appendSummaryRow(container, 'Aktive URL', config.tautulliUrl || 'Nicht gesetzt');
  appendSummaryRow(
    container,
    'Gespeicherte DB-Konfiguration',
    saved.source === 'tautulli_config' && saved.tautulliUrl
      ? saved.tautulliUrl
      : 'Nicht gespeichert',
  );

  if (config.envOverride) {
    const warning = document.createElement('p');
    warning.className = 'admin-warning-text';
    warning.textContent = 'DB-Konfiguration ist gespeichert, aber aktuell nicht aktiv, weil ENV Vorrang hat.';
    container.appendChild(warning);

    const hint = document.createElement('p');
    hint.className = 'admin-muted-text';
    hint.textContent = 'Gespeicherte Werte werden erst aktiv, wenn TAUTULLI_URL und TAUTULLI_API_KEY nicht per ENV gesetzt sind.';
    container.appendChild(hint);
  }
}
