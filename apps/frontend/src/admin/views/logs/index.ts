import type { AdminViewModule } from '../index.ts';
import { adminApiClient, type LogEntry, type LogLevel } from '../../core/api.ts';
import { createCard } from '../../components/card.ts';

const DEFAULT_LIMIT = 150;
const MAX_LIMIT = 500;
const MIN_LIMIT = 10;

export const logsView: AdminViewModule = {
  id: 'logs',
  label: 'Logs',
  title: 'Laufzeit-Logs',
  description: 'In-Memory-Logpuffer filtern und verwalten.',
  mount: ({ container, toast }) => {
    const card = createCard({
      title: 'Runtime-Logs',
      description: 'Letzte Einträge aus dem In-Memory-Puffer.',
    });

    const controls = document.createElement('div');
    controls.className = 'admin-button-row';

    const levelLabel = createLabel('Level');
    const levelSelect = document.createElement('select');
    levelSelect.className = 'admin-input';
    levelSelect.innerHTML = `
      <option value="">Alle</option>
      <option value="debug">Debug</option>
      <option value="info">Info</option>
      <option value="warn">Warn</option>
      <option value="error">Error</option>
    `;

    const limitLabel = createLabel('Limit');
    const limitInput = document.createElement('input');
    limitInput.type = 'number';
    limitInput.min = String(MIN_LIMIT);
    limitInput.max = String(MAX_LIMIT);
    limitInput.value = String(DEFAULT_LIMIT);
    limitInput.className = 'admin-input';

    const refreshButton = createButton('Aktualisieren');
    const clearButton = createButton('Logs leeren', 'danger');

    controls.append(levelLabel, levelSelect, limitLabel, limitInput, refreshButton, clearButton);

    const summary = document.createElement('p');
    summary.className = 'admin-muted-text';
    summary.textContent = 'Noch keine Logs geladen.';

    const logView = document.createElement('pre');
    logView.className = 'admin-log-view';
    logView.textContent = 'Klicke auf „Aktualisieren“, um Logs zu laden.';

    card.body.append(controls, summary, logView);
    container.appendChild(card);

    let isLoading = false;

    const getLimit = (): number => {
      const parsed = Number.parseInt(limitInput.value, 10);
      if (Number.isNaN(parsed)) return DEFAULT_LIMIT;
      return Math.min(Math.max(parsed, MIN_LIMIT), MAX_LIMIT);
    };

    const renderLogs = (entries: LogEntry[]): void => {
      if (!entries.length) {
        logView.textContent = 'Keine Logs für die aktuelle Auswahl.';
        summary.textContent = 'Logpuffer ist leer.';
        return;
      }
      const lines = entries.map(formatLogEntry);
      logView.textContent = lines.join('\n');
      summary.textContent = `${entries.length} Einträge geladen. Letzter Eintrag: ${entries[entries.length - 1].timestamp}.`;
    };

    const loadLogs = async () => {
      if (isLoading) return;
      isLoading = true;
      refreshButton.disabled = true;
      summary.textContent = 'Lade Logs...';

      try {
        const level = (levelSelect.value || '') as LogLevel | '';
        const result = await adminApiClient.getLogs({
          limit: getLimit(),
          level: level || undefined,
        });
        renderLogs(result.logs);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Logs konnten nicht geladen werden.';
        summary.textContent = message;
        toast.show(message, 'error');
      } finally {
        refreshButton.disabled = false;
        isLoading = false;
      }
    };

    refreshButton.addEventListener('click', () => void loadLogs());
    levelSelect.addEventListener('change', () => void loadLogs());
    limitInput.addEventListener('change', () => void loadLogs());

    clearButton.addEventListener('click', async () => {
      clearButton.disabled = true;
      try {
        await adminApiClient.clearLogs();
        toast.show('Logpuffer geleert', 'success');
        await loadLogs();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Logpuffer konnte nicht geleert werden.';
        toast.show(message, 'error');
      } finally {
        clearButton.disabled = false;
      }
    });

    void loadLogs();
    return () => {};
  },
};

function formatLogEntry(entry: LogEntry): string {
  const timestamp = entry.timestamp;
  const level = entry.level.toUpperCase().padEnd(5);
  const context = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
  return `[${timestamp}] [${level}] ${entry.message}${context}`;
}

function createLabel(text: string): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'admin-label';
  label.textContent = text;
  return label;
}

function createButton(text: string, variant: 'default' | 'primary' | 'danger' = 'default'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ['admin-btn', variant === 'primary' ? 'admin-btn-primary' : '', variant === 'danger' ? 'admin-btn-danger' : '']
    .filter(Boolean)
    .join(' ');
  button.textContent = text;
  return button;
}
