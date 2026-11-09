import { useCallback, useMemo } from 'react';
import { FilterOperator, FolderTab, LogLevel, SavedFilter, SearchFilter, SearchMode } from '../types';
import { cloneFilterTerms } from '../services/filterStorage';
import { looksLikeFieldFilter } from '../services/logFields';
import { getIncludeBlocks, getPatternError } from '../services/logSearch';

export const MAX_CUSTOM_LINE_LIMIT = 500000;
const NO_SEARCH_FILTERS: SearchFilter[] = [];

const newFilterId = () => `search-filter-${Date.now()}-${crypto.randomUUID()}`;

/**
 * The search state of the active tab (terms, level, period, limit) and the actions that change it.
 * Everything is stored in the tab, so each folder keeps its own filters.
 */
export function useTabFilters(activeTab: FolderTab | null, updateActiveTab: (updater: (tab: FolderTab) => FolderTab) => void) {
  const searchTerm = activeTab?.searchTerm || '';
  const searchMode: SearchMode = activeTab?.searchMode || 'include';
  const searchFilters = activeTab?.searchFilters || NO_SEARCH_FILTERS;
  const includeOperator: FilterOperator = activeTab?.includeOperator || 'or';
  const levelFilter: LogLevel = activeTab?.levelFilter || 'ALL';
  const lineLimit = activeTab?.lineLimit || 'ALL';
  const customLineLimit = activeTab?.customLineLimit || 100;
  const lineLimitDirection = activeTab?.lineLimitDirection || 'tail';
  const searchRegex = Boolean(activeTab?.searchRegex);
  const searchCaseSensitive = Boolean(activeTab?.searchCaseSensitive);
  const timeFrom = activeTab?.timeFrom;
  const timeTo = activeTab?.timeTo;
  const hasTimeRange = timeFrom !== undefined || timeTo !== undefined;
  const searchPatternError = searchTerm.trim() ? getPatternError({ text: searchTerm.trim(), regex: searchRegex }) : null;

  // Field filters ($campo = valor) select records but are not text to highlight.
  const highlightTerms = useMemo(
    () => searchFilters.filter((filter) => filter.mode === 'include' && !looksLikeFieldFilter(filter.text)),
    [searchFilters]
  );
  const includeBlocks = useMemo(() => getIncludeBlocks(searchFilters, includeOperator), [searchFilters, includeOperator]);
  const excludeFilters = useMemo(() => searchFilters.filter((filter) => filter.mode === 'exclude'), [searchFilters]);
  const hasActiveFilters = searchFilters.length > 0 || levelFilter !== 'ALL' || lineLimit !== 'ALL' || hasTimeRange;

  const setSearchTerm = (term: string) => updateActiveTab((tab) => ({ ...tab, searchTerm: term }));
  const toggleSearchRegex = () => updateActiveTab((tab) => ({ ...tab, searchRegex: !tab.searchRegex }));
  const toggleSearchCaseSensitive = () => updateActiveTab((tab) => ({ ...tab, searchCaseSensitive: !tab.searchCaseSensitive }));
  const setTimeRange = (from: number | undefined, to: number | undefined) => updateActiveTab((tab) => ({ ...tab, timeFrom: from, timeTo: to }));
  const setLevelFilter = (level: LogLevel) => updateActiveTab((tab) => ({ ...tab, levelFilter: level }));
  const setLineLimit = (limit: string) => updateActiveTab((tab) => ({ ...tab, lineLimit: limit }));
  const setCustomLineLimit = (count: number) =>
    updateActiveTab((tab) => ({ ...tab, customLineLimit: Math.min(MAX_CUSTOM_LINE_LIMIT, Math.max(1, count)) }));
  const setLineLimitDirection = (direction: 'tail' | 'head') => updateActiveTab((tab) => ({ ...tab, lineLimitDirection: direction }));

  /** Turns the text in the search box into an included or excluded term (with the Aa / .* options). */
  const addSearchFilter = (mode: SearchMode) => {
    const text = searchTerm.trim();
    if (!text || searchPatternError) return;
    const key = text.toLocaleLowerCase('pt-BR');
    updateActiveTab((tab) => {
      const regex = Boolean(tab.searchRegex);
      const caseSensitive = Boolean(tab.searchCaseSensitive);
      const sameText = (filter: SearchFilter) =>
        Boolean(filter.regex) === regex &&
        Boolean(filter.caseSensitive) === caseSensitive &&
        (caseSensitive || regex ? filter.text === text : filter.text.toLocaleLowerCase('pt-BR') === key);
      const current = tab.searchFilters || [];
      if (current.some((filter) => filter.mode === mode && sameText(filter))) return { ...tab, searchTerm: '', searchMode: mode };
      // Including and excluding the same text would always yield zero results: the new intent replaces the old one.
      const filter: SearchFilter = { id: newFilterId(), text, mode, ...(regex ? { regex } : {}), ...(caseSensitive ? { caseSensitive } : {}) };
      return { ...tab, searchTerm: '', searchMode: mode, searchFilters: [...current.filter((item) => !sameText(item)), filter] };
    });
  };

  /** Adds a ready-made term: a regex from "Top erros" or a `$campo = valor` from the details panel. */
  const addFilterTerm = (text: string, mode: SearchMode, regex = false) =>
    updateActiveTab((tab) => ({
      ...tab,
      searchFilters: [...(tab.searchFilters || []), { id: newFilterId(), text, mode, ...(regex ? { regex } : {}) }],
    }));

  const removeSearchFilter = (filterId: string) =>
    updateActiveTab((tab) => ({ ...tab, searchFilters: (tab.searchFilters || []).filter((filter) => filter.id !== filterId) }));

  const toggleSearchFilterMode = (filterId: string) =>
    updateActiveTab((tab) => ({
      ...tab,
      searchFilters: (tab.searchFilters || []).map((filter) =>
        filter.id === filterId ? { ...filter, mode: filter.mode === 'include' ? 'exclude' : 'include' } : filter
      ),
    }));

  /** Flips the connector between this included term and the previous one. */
  const toggleConnector = (filterId: string) =>
    updateActiveTab((tab) => ({
      ...tab,
      searchFilters: (tab.searchFilters || []).map((filter) => {
        if (filter.id !== filterId) return filter;
        const current = filter.connector ?? tab.includeOperator ?? 'or';
        return { ...filter, connector: current === 'or' ? 'and' : 'or' };
      }),
    }));

  const applySavedFilter = (saved: SavedFilter) =>
    updateActiveTab((tab) => ({
      ...tab,
      searchTerm: '',
      // Older saved filters only have one operator for all terms: turn it into per-term connectors.
      searchFilters: cloneFilterTerms(saved).map((filter) => ({ ...filter, connector: filter.connector ?? saved.includeOperator })),
      includeOperator: 'or',
      levelFilter: saved.levelFilter,
    }));

  const clearAllFilters = useCallback(
    () =>
      updateActiveTab((tab) => ({
        ...tab,
        searchTerm: '',
        searchMode: 'include',
        searchFilters: [],
        includeOperator: 'or',
        levelFilter: 'ALL',
        lineLimit: 'ALL',
        timeFrom: undefined,
        timeTo: undefined,
      })),
    [updateActiveTab]
  );

  return {
    searchTerm, searchMode, searchFilters, includeOperator, levelFilter,
    lineLimit, customLineLimit, lineLimitDirection, searchRegex, searchCaseSensitive,
    timeFrom, timeTo, hasTimeRange, searchPatternError,
    highlightTerms, includeBlocks, excludeFilters, hasActiveFilters,
    setSearchTerm, toggleSearchRegex, toggleSearchCaseSensitive, setTimeRange, setLevelFilter,
    setLineLimit, setCustomLineLimit, setLineLimitDirection,
    addSearchFilter, addFilterTerm, removeSearchFilter, toggleSearchFilterMode, toggleConnector,
    applySavedFilter, clearAllFilters,
  };
}

export type TabFilters = ReturnType<typeof useTabFilters>;
