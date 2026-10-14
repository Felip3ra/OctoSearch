import { FilterOperator, LogLevel, SavedFilter, SearchFilter } from '../types';

const STORAGE_KEY = 'log-viewer-saved-filters-v1';

const LEVELS: LogLevel[] = ['ALL', 'INF', 'WRN', 'ERR', 'DBG', 'OTHER'];

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}

function isSearchFilter(value: unknown): value is SearchFilter {
  const filter = value as SearchFilter;
  return (
    typeof filter?.id === 'string' &&
    typeof filter?.text === 'string' &&
    (filter?.mode === 'include' || filter?.mode === 'exclude')
  );
}

function normalizeSavedFilter(value: unknown): SavedFilter | null {
  const raw = value as Partial<SavedFilter>;
  if (typeof raw?.id !== 'string' || typeof raw?.name !== 'string' || !Array.isArray(raw?.filters)) {
    return null;
  }
  const operator: FilterOperator = raw.includeOperator === 'and' ? 'and' : 'or';
  return {
    id: raw.id,
    name: raw.name,
    group: typeof raw.group === 'string' ? raw.group : '',
    filters: raw.filters.filter(isSearchFilter),
    includeOperator: operator,
    levelFilter: LEVELS.includes(raw.levelFilter as LogLevel) ? (raw.levelFilter as LogLevel) : 'ALL',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

export function getSavedFilters(): SavedFilter[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSavedFilter).filter((filter): filter is SavedFilter => filter !== null);
  } catch (err) {
    console.warn('Erro ao carregar filtros salvos do localStorage:', err);
    return [];
  }
}

export function persistSavedFilters(filters: SavedFilter[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch (err) {
    console.warn('Erro ao salvar filtros no localStorage:', err);
  }
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');
}

/** Finds a saved filter with the same name inside the same group (names are unique per group). */
export function findSavedFilter(list: SavedFilter[], name: string, group: string): SavedFilter | undefined {
  return list.find((item) => sameName(item.name, name) && sameName(item.group, group));
}

/** Saves the current filters; a filter with the same name in the same group is overwritten. */
export function upsertSavedFilter(
  list: SavedFilter[],
  draft: { name: string; group: string; filters: SearchFilter[]; includeOperator: FilterOperator; levelFilter: LogLevel }
): SavedFilter[] {
  const name = draft.name.trim();
  const group = draft.group.trim();
  const now = Date.now();
  const filters = draft.filters.map((filter) => ({ ...filter }));
  const existing = findSavedFilter(list, name, group);
  if (existing) {
    return list.map((item) =>
      item.id === existing.id
        ? { ...item, name, group, filters, includeOperator: draft.includeOperator, levelFilter: draft.levelFilter, updatedAt: now }
        : item
    );
  }
  return [
    ...list,
    {
      id: createId('saved-filter'),
      name,
      group,
      filters,
      includeOperator: draft.includeOperator,
      levelFilter: draft.levelFilter,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/** Copies a saved filter's terms with fresh ids so they can live in a tab independently. */
export function cloneFilterTerms(saved: SavedFilter): SearchFilter[] {
  return saved.filters.map((filter) => ({ ...filter, id: createId('search-filter') }));
}

/** Distinct, alphabetically sorted group names (the empty "no group" is left out). */
export function listFilterGroups(list: SavedFilter[]): string[] {
  const groups = new Map<string, string>();
  for (const item of list) {
    const group = item.group.trim();
    if (group) groups.set(group.toLocaleLowerCase('pt-BR'), group);
  }
  return [...groups.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
