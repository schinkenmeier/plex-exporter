import type { AdminViewModule } from '../index.ts';
import {
  adminApiClient,
  type DatabaseColumnInfo,
  type DatabaseQueryRequest,
  type DatabaseQueryResponse,
  type DatabaseTablesResponse,
} from '../../core/api.ts';

const DB_PAGE_SIZE = 25;

interface DatabaseState {
  tables: Array<{ name: string; rowCount: number | null }>;
  loadingTables: boolean;
  tablesError: string | null;
  activeTable: string | null;
  columns: DatabaseColumnInfo[];
  rows: Record<string, unknown>[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  orderBy: string | null;
  direction: 'ASC' | 'DESC';
  search: string;
  filterOptions: DatabaseQueryResponse['filterOptions'];
  filters: DatabaseQueryRequest['filters'] & {
    primaryKeyValue?: string | null;
  };
  selectedColumns: string[];
  loadingRows: boolean;
  rowsError: string | null;
  searchableColumns: string[];
}

interface Elements {
  tableList: HTMLElement;
  reloadTables: HTMLButtonElement;
  columnList: HTMLElement;
  activeTable: HTMLElement;
  tableMeta: HTMLElement;
  searchInput: HTMLInputElement;
  searchButton: HTMLButtonElement;
  searchClear: HTMLButtonElement;
  refreshButton: HTMLButtonElement;
  searchHint: HTMLElement;
  pkInput: HTMLInputElement;
  pkApply: HTMLButtonElement;
  pkClear: HTMLButtonElement;
  pkHint: HTMLElement;
  dateColumnSelect: HTMLSelectElement;
  dateFrom: HTMLInputElement;
  dateTo: HTMLInputElement;
  dateApply: HTMLButtonElement;
  dateClear: HTMLButtonElement;
  enumFilters: HTMLElement;
  nullFilters: HTMLElement;
  tableHead: HTMLElement;
  tableBody: HTMLElement;
  prevPage: HTMLButtonElement;
  nextPage: HTMLButtonElement;
  pageInfo: HTMLElement;
}

export const databaseView: AdminViewModule = {
  id: 'database',
  label: 'Datenbank',
  title: 'Datenbank-Explorer',
  description: 'SQLite-Tabellen durchsuchen und filtern.',
  mount: ({ container, toast }) => {
    container.innerHTML = createLayout();
    const elements = resolveElements(container);
    const state: DatabaseState = {
      tables: [],
      loadingTables: false,
      tablesError: null,
      activeTable: null,
      columns: [],
      rows: [],
      pagination: { limit: DB_PAGE_SIZE, offset: 0, total: 0, hasMore: false },
      orderBy: null,
      direction: 'ASC',
      search: '',
      filterOptions: { primaryKey: null, dateColumns: [], enumValues: {}, nullableColumns: [] },
      filters: { equals: [], nulls: [], dateRange: null, primaryKeyValue: null },
      selectedColumns: [],
      loadingRows: false,
      rowsError: null,
      searchableColumns: [],
    };

    const loadTables = async (force = false) => {
      if (state.loadingTables) return;
      state.loadingTables = true;
      renderTableList();
      try {
        if (!state.tables.length || force) {
          const data = await adminApiClient.getDatabaseTables();
          state.tables = data.tables;
        }
        state.tablesError = null;
      } catch (error) {
        state.tablesError = error instanceof Error ? error.message : 'Tabellen konnten nicht geladen werden.';
        toast.show(state.tablesError, 'error');
      } finally {
        state.loadingTables = false;
        renderTableList();
      }
    };

    const renderTableList = () => {
      if (state.loadingTables) {
        elements.tableList.innerHTML = '<div class="admin-muted-text">Lade Tabellen...</div>';
        elements.reloadTables.disabled = true;
        return;
      }
      elements.reloadTables.disabled = false;
      if (state.tablesError) {
        elements.tableList.innerHTML = `<div class="admin-error-text">${state.tablesError}</div>`;
        return;
      }
      if (!state.tables.length) {
        elements.tableList.innerHTML = '<div class="admin-muted-text">Keine Tabellen gefunden.</div>';
        return;
      }

      elements.tableList.innerHTML = state.tables
        .map(
          table => `
            <button class="db-table-button${table.name === state.activeTable ? ' active' : ''}" data-table="${table.name}">
              <span>${table.name}</span>
              <span class="db-table-count">${table.rowCount ?? '–'}</span>
            </button>
          `,
        )
        .join('');
    };

    const setActiveTable = async (tableName: string) => {
      if (state.activeTable === tableName) return;
      state.activeTable = tableName;
      state.pagination.offset = 0;
      state.filters = { equals: [], nulls: [], dateRange: null, primaryKeyValue: null };
      state.selectedColumns = [];
      state.orderBy = null;
      state.direction = 'ASC';
      state.search = '';
      elements.searchInput.value = '';
      elements.pkInput.value = '';
      elements.dateColumnSelect.selectedIndex = 0;
      elements.dateFrom.value = '';
      elements.dateTo.value = '';
      renderTableList();
      await loadRows();
    };

    const loadRows = async () => {
      if (!state.activeTable) return;
      state.loadingRows = true;
      renderContent();
      try {
        const payload: DatabaseQueryRequest = {
          table: state.activeTable,
          limit: state.pagination.limit,
          offset: state.pagination.offset,
          direction: state.direction,
          orderBy: state.orderBy ?? undefined,
          columns: state.selectedColumns.length ? state.selectedColumns : undefined,
          filters: {
            equals: state.filters.equals,
            nulls: state.filters.nulls,
            dateRange: state.filters.dateRange ?? undefined,
          },
          search: state.search || undefined,
          primaryKeyValue: state.filters.primaryKeyValue || undefined,
        };

        const response = await adminApiClient.queryDatabase(payload);
        state.columns = response.columns;
        state.rows = response.rows;
        state.pagination = response.pagination;
        state.filterOptions = response.filterOptions;
        state.rowsError = null;
        state.selectedColumns = response.selectedColumns;
        state.orderBy = response.orderBy;
        state.direction = response.direction;
        state.search = response.search ?? '';
        state.searchableColumns = response.searchableColumns ?? [];
      } catch (error) {
        state.rowsError = error instanceof Error ? error.message : 'Tabellenzeilen konnten nicht geladen werden.';
        toast.show(state.rowsError, 'error');
      } finally {
        state.loadingRows = false;
        renderContent();
      }
    };

    const renderContent = () => {
      elements.activeTable.textContent = state.activeTable ?? 'Tabelle auswählen';
      const total = state.tables.find(table => table.name === state.activeTable)?.rowCount ?? 0;
      elements.tableMeta.textContent = state.activeTable
        ? `${total} Zeilen gesamt • Anzeige ${state.pagination.offset + 1} – ${state.pagination.offset + state.rows.length}`
        : 'Wähle eine Tabelle aus der Liste.';

      elements.searchInput.disabled = !state.activeTable || state.loadingRows;
      elements.searchInput.value = state.search;
      elements.searchHint.textContent = state.loadingRows
        ? 'Lade Daten...'
        : !state.activeTable
          ? 'Keine Tabelle ausgewählt.'
          : state.searchableColumns.length
            ? `Suchbare Spalten: ${state.searchableColumns.join(', ')}`
            : 'Diese Tabelle besitzt keine textbasierten Spalten für Volltextsuche.';

      renderColumns();
      renderFilters();
      renderTable();
      renderPagination();
    };

    const renderColumns = () => {
      if (!state.columns.length) {
        elements.columnList.innerHTML = '<div class="admin-muted-text">Keine Spalten verfügbar.</div>';
        return;
      }
      const allSelected = state.selectedColumns.length === 0 || state.selectedColumns.length === state.columns.length;
      elements.columnList.innerHTML = state.columns
        .map(column => {
          const checked = allSelected || state.selectedColumns.includes(column.name);
          return `
            <label class="db-column-item">
              <input type="checkbox" value="${column.name}" ${checked ? 'checked' : ''}>
              <span>${column.name}</span>
            </label>
          `;
        })
        .join('');
    };

    const renderFilters = () => {
      const pk = state.filterOptions.primaryKey;
      const hasPk = Boolean(pk);
      elements.pkInput.disabled = !hasPk;
      elements.pkApply.disabled = !hasPk;
      elements.pkClear.disabled = !hasPk;
      elements.pkHint.textContent = hasPk ? `Primärschlüssel: ${pk}` : 'Kein Primärschlüssel erkannt.';

      elements.dateColumnSelect.innerHTML = state.filterOptions.dateColumns
        .map(column => `<option value="${column}">${column}</option>`)
        .join('');
      const hasDateColumns = state.filterOptions.dateColumns.length > 0;
      elements.dateColumnSelect.disabled = !hasDateColumns;
      elements.dateFrom.disabled = !hasDateColumns;
      elements.dateTo.disabled = !hasDateColumns;
      elements.dateApply.disabled = !hasDateColumns;
      elements.dateClear.disabled = !hasDateColumns;

      if (!hasDateColumns) {
        elements.dateColumnSelect.innerHTML = '<option value="">Keine Datums-Spalten</option>';
      }

      const enumEntries = Object.entries(state.filterOptions.enumValues);
      elements.enumFilters.innerHTML = enumEntries.length
        ? enumEntries
            .map(([column, values]) => {
              const buttons = values
                .map(
                  value => `
              <button class="db-pill${state.filters.equals?.some(filter => filter.column === column && String(filter.value) === String(value.value)) ? ' active' : ''}" data-column="${column}" data-value="${value.value}">
                ${value.value} (${value.count})
              </button>`,
                )
                .join('');
              return `<div><strong>${column}</strong><div class="db-pill-list">${buttons}</div></div>`;
            })
            .join('')
        : '<div class="admin-muted-text">Keine Schnellfilter.</div>';

      const nullable = state.filterOptions.nullableColumns;
      elements.nullFilters.innerHTML = nullable.length
        ? nullable
            .map(
              column => `
            <div class="db-pill-list">
              <button class="db-pill${state.filters.nulls?.some(filter => filter.column === column && filter.mode === 'null') ? ' active' : ''}" data-null-mode="null" data-column="${column}">${column} IS NULL</button>
              <button class="db-pill${state.filters.nulls?.some(filter => filter.column === column && filter.mode === 'notNull') ? ' active' : ''}" data-null-mode="notNull" data-column="${column}">${column} IS NOT NULL</button>
            </div>`,
            )
            .join('')
        : '<div class="admin-muted-text">Keine NULL-Spalten.</div>';
    };

    const renderTable = () => {
      if (!state.columns.length) {
        elements.tableHead.innerHTML = '';
        elements.tableBody.innerHTML = `<tr><td class="db-empty-state" colspan="1">${state.activeTable ? 'Keine Spalten verfügbar.' : 'Bitte Tabelle auswählen.'}</td></tr>`;
        return;
      }
      elements.tableHead.innerHTML = state.columns
        .map(column => {
          const isActive = state.orderBy === column.name;
          const indicator = isActive ? (state.direction === 'DESC' ? '▼' : '▲') : '';
          return `<th><button class="db-sort-button${isActive ? ' active' : ''}" data-column="${column.name}">${column.name} ${indicator}</button></th>`;
        })
        .join('');

      if (state.loadingRows) {
        elements.tableBody.innerHTML = `<tr><td colspan="${state.columns.length}" class="admin-muted-text">Lade Zeilen...</td></tr>`;
        return;
      }
      if (state.rowsError) {
        elements.tableBody.innerHTML = `<tr><td colspan="${state.columns.length}" class="admin-error-text">${state.rowsError}</td></tr>`;
        return;
      }
      if (!state.rows.length) {
        elements.tableBody.innerHTML = `<tr><td colspan="${state.columns.length}" class="admin-muted-text">Keine Zeilen für aktuelle Auswahl.</td></tr>`;
        return;
      }
      elements.tableBody.innerHTML = state.rows
        .map(
          row =>
            `<tr>${state.columns
              .map(column => `<td>${formatCell(row[column.name])}</td>`)
              .join('')}</tr>`,
        )
        .join('');
    };

    const renderPagination = () => {
      const total = state.pagination.total ?? 0;
      const from = total === 0 ? 0 : state.pagination.offset + 1;
      const to = state.pagination.offset + state.rows.length;
      elements.pageInfo.textContent = `${from} – ${to} von ${total}`;

      elements.prevPage.disabled = state.pagination.offset <= 0 || state.loadingRows;
      const hasMore = state.pagination.hasMore ?? state.pagination.offset + state.pagination.limit < total;
      elements.nextPage.disabled = !hasMore || state.loadingRows;

      elements.refreshButton.disabled = state.loadingRows || !state.activeTable;
      elements.searchButton.disabled = state.loadingRows || !state.activeTable;
      elements.searchClear.disabled = state.loadingRows || !state.activeTable || !state.search;
    };

    elements.tableList.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-table]');
      if (!button) return;
      const table = button.dataset.table;
      if (table) {
        void setActiveTable(table);
      }
    });

    elements.reloadTables.addEventListener('click', () => void loadTables(true));

    elements.columnList.addEventListener('change', event => {
      const input = event.target as HTMLInputElement;
      if (!input || !input.value) return;
      const current = new Set(state.selectedColumns.length ? state.selectedColumns : state.columns.map(col => col.name));
      if (input.checked) {
        current.add(input.value);
      } else {
        current.delete(input.value);
      }
      state.selectedColumns = Array.from(current);
      void loadRows();
    });

    elements.searchButton.addEventListener('click', () => {
      state.search = elements.searchInput.value.trim();
      state.pagination.offset = 0;
      void loadRows();
    });

    elements.searchClear.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.search = '';
      state.pagination.offset = 0;
      void loadRows();
    });

    elements.searchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        elements.searchButton.click();
      }
    });

    elements.refreshButton.addEventListener('click', () => void loadRows());

    elements.prevPage.addEventListener('click', () => {
      state.pagination.offset = Math.max(0, state.pagination.offset - state.pagination.limit);
      void loadRows();
    });
    elements.nextPage.addEventListener('click', () => {
      state.pagination.offset = state.pagination.offset + state.pagination.limit;
      void loadRows();
    });

    elements.tableHead.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-column]');
      if (!button) return;
      const column = button.dataset.column ?? '';
      if (!column) return;
      if (state.orderBy === column) {
        state.direction = state.direction === 'ASC' ? 'DESC' : 'ASC';
      } else {
        state.orderBy = column;
        state.direction = 'ASC';
      }
      void loadRows();
    });

    elements.enumFilters.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-column]');
      if (!button || !button.dataset.value) return;
      const column = button.dataset.column;
      const value = button.dataset.value;
      if (!column || value === undefined) return;
      const next = state.filters.equals?.slice() ?? [];
      const existingIndex = next.findIndex(filter => filter.column === column && String(filter.value) === String(value));
      if (existingIndex >= 0) {
        next.splice(existingIndex, 1);
      } else {
        next.push({ column, value });
      }
      state.filters.equals = next;
      state.pagination.offset = 0;
      void loadRows();
    });

    elements.nullFilters.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-null-mode]');
      if (!button) return;
      const column = button.dataset.column;
      const mode = button.dataset.nullMode as 'null' | 'notNull' | undefined;
      if (!column || !mode) return;
      const next = state.filters.nulls?.slice() ?? [];
      const existingIndex = next.findIndex(filter => filter.column === column && filter.mode === mode);
      if (existingIndex >= 0) {
        next.splice(existingIndex, 1);
      } else {
        next.push({ column, mode });
      }
      state.filters.nulls = next;
      state.pagination.offset = 0;
      void loadRows();
    });

    elements.pkApply.addEventListener('click', () => {
      const value = elements.pkInput.value.trim();
      if (!value) return;
      state.filters.primaryKeyValue = value;
      state.pagination.offset = 0;
      void loadRows();
    });

    elements.pkClear.addEventListener('click', () => {
      elements.pkInput.value = '';
      state.filters.primaryKeyValue = null;
      state.pagination.offset = 0;
      void loadRows();
    });

    elements.dateApply.addEventListener('click', () => {
      const column = elements.dateColumnSelect.value;
      if (!column) return;
      state.filters.dateRange = {
        column,
        from: elements.dateFrom.value || undefined,
        to: elements.dateTo.value || undefined,
      };
      state.pagination.offset = 0;
      void loadRows();
    });

    elements.dateClear.addEventListener('click', () => {
      elements.dateColumnSelect.selectedIndex = 0;
      elements.dateFrom.value = '';
      elements.dateTo.value = '';
      state.filters.dateRange = null;
      state.pagination.offset = 0;
      void loadRows();
    });

    void loadTables();
    return () => {};
  },
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '<span class="admin-muted-text">NULL</span>';
  if (typeof value === 'object') {
    try {
      return `<code>${escapeHtml(JSON.stringify(value))}</code>`;
    } catch {
      return `<code>${escapeHtml(String(value))}</code>`;
    }
  }
  const text = String(value);
  if (text.length > 180) {
    return `<span title="${escapeHtml(text)}">${escapeHtml(text.slice(0, 180))}&hellip;</span>`;
  }
  return escapeHtml(text);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createLayout(): string {
  return `
    <div class="admin-database">
      <aside class="db-table-panel">
        <header>
          <div>
            <h3>Tabellen</h3>
            <p>Schema & Beispielzeilen durchsuchen.</p>
          </div>
          <button class="admin-btn" id="db-reload-schema">Neu laden</button>
        </header>
        <div class="db-table-list" id="db-table-list">
          <div class="admin-muted-text">Lade Tabellen...</div>
        </div>
      </aside>
      <section class="db-content-panel">
        <article class="admin-panel">
          <div class="db-filter-grid">
            <div>
              <h4>Spalten</h4>
              <div id="db-column-list" class="db-column-list">
                <div class="admin-muted-text">Keine Spalten geladen.</div>
              </div>
            </div>
            <div>
              <h4>Primärschlüssel</h4>
              <div class="db-filter-row">
                <input class="admin-input" id="db-pk-input" placeholder="Wert eingeben" disabled>
                <button class="admin-btn" id="db-apply-pk" disabled>Springen</button>
                <button class="admin-btn" id="db-clear-pk" disabled>Zurücksetzen</button>
              </div>
              <p class="admin-muted-text" id="db-pk-hint">Kein Primärschlüssel.</p>
            </div>
            <div>
              <h4>Zeitraum</h4>
              <select class="admin-input" id="db-date-column" disabled>
                <option value="">Keine Datums-Spalten</option>
              </select>
              <div class="db-filter-row">
                <input type="datetime-local" class="admin-input" id="db-date-from" disabled>
                <input type="datetime-local" class="admin-input" id="db-date-to" disabled>
              </div>
              <div class="db-filter-row">
                <button class="admin-btn" id="db-apply-date" disabled>Anwenden</button>
                <button class="admin-btn" id="db-clear-date" disabled>Zurücksetzen</button>
              </div>
            </div>
            <div>
              <h4>Schnellfilter</h4>
              <div id="db-enum-filters" class="db-pill-container">
                <div class="admin-muted-text">Keine Schnellfilter.</div>
              </div>
            </div>
            <div>
              <h4>NULL-Filter</h4>
              <div id="db-null-filters" class="db-pill-container">
                <div class="admin-muted-text">Keine NULL-Spalten.</div>
              </div>
            </div>
          </div>
        </article>
        <article class="admin-panel">
          <div class="db-header">
            <div>
              <h3 id="db-active-table">Tabelle auswählen</h3>
              <p id="db-table-meta">Wähle eine Tabelle, um Zeilen zu sehen.</p>
            </div>
            <div class="db-controls">
              <input class="admin-input" id="db-search-input" placeholder="Suche in Tabelle" disabled>
              <button class="admin-btn" id="db-search-button" disabled>Suche</button>
              <button class="admin-btn" id="db-clear-search" disabled>Reset</button>
              <button class="admin-btn" id="db-refresh-table" disabled>Aktualisieren</button>
            </div>
          </div>
          <p class="admin-muted-text" id="db-search-hint">Keine Tabelle ausgewählt.</p>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr id="db-table-head"></tr>
              </thead>
              <tbody id="db-table-body">
                <tr><td class="db-empty-state">Tabellenzeilen erscheinen hier.</td></tr>
              </tbody>
            </table>
          </div>
          <div class="db-pagination">
            <button class="admin-btn" id="db-prev-page" disabled>Zurück</button>
            <span id="db-page-info">0 – 0 von 0</span>
            <button class="admin-btn" id="db-next-page" disabled>Weiter</button>
          </div>
        </article>
      </section>
    </div>
  `;
}

function resolveElements(root: HTMLElement): Elements {
  const byId = <T extends HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`#${id}`);
    if (!el) throw new Error(`Element #${id} nicht gefunden`);
    return el;
  };
  return {
    tableList: byId('db-table-list'),
    reloadTables: byId('db-reload-schema') as HTMLButtonElement,
    columnList: byId('db-column-list'),
    activeTable: byId('db-active-table'),
    tableMeta: byId('db-table-meta'),
    searchInput: byId('db-search-input') as HTMLInputElement,
    searchButton: byId('db-search-button') as HTMLButtonElement,
    searchClear: byId('db-clear-search') as HTMLButtonElement,
    refreshButton: byId('db-refresh-table') as HTMLButtonElement,
    searchHint: byId('db-search-hint'),
    pkInput: byId('db-pk-input') as HTMLInputElement,
    pkApply: byId('db-apply-pk') as HTMLButtonElement,
    pkClear: byId('db-clear-pk') as HTMLButtonElement,
    pkHint: byId('db-pk-hint'),
    dateColumnSelect: byId('db-date-column') as HTMLSelectElement,
    dateFrom: byId('db-date-from') as HTMLInputElement,
    dateTo: byId('db-date-to') as HTMLInputElement,
    dateApply: byId('db-apply-date') as HTMLButtonElement,
    dateClear: byId('db-clear-date') as HTMLButtonElement,
    enumFilters: byId('db-enum-filters'),
    nullFilters: byId('db-null-filters'),
    tableHead: byId('db-table-head'),
    tableBody: byId('db-table-body'),
    prevPage: byId('db-prev-page') as HTMLButtonElement,
    nextPage: byId('db-next-page') as HTMLButtonElement,
    pageInfo: byId('db-page-info'),
  };
}
