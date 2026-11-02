import { useEffect } from 'react';
import { FileSortField, HighlightRule, SortDirection } from '../types';
import { normalizeHighlightColor } from '../utils/highlightColor';
import { booleanCodec, enumCodec, PersistedStateCodec, stringCodec, usePersistedState } from './usePersistedState';

const highlightRulesCodec: PersistedStateCodec<HighlightRule[]> = {
  parse: (raw) => {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return undefined;
      return parsed.flatMap((rule): HighlightRule[] => {
        const color = normalizeHighlightColor(rule?.color);
        if (
          typeof rule?.id !== 'string' ||
          typeof rule?.text !== 'string' ||
          !color ||
          typeof rule?.caseSensitive !== 'boolean' ||
          typeof rule?.enabled !== 'boolean'
        ) {
          return [];
        }
        return [{ ...rule, color }];
      });
    } catch {
      return undefined;
    }
  },
  serialize: (rules) => JSON.stringify(rules),
};

const themeCodec: PersistedStateCodec<boolean> = {
  parse: (raw) => (raw === 'dark' ? true : raw === 'light' ? false : undefined),
  serialize: (isDark) => (isDark ? 'dark' : 'light'),
};
const fileSortFieldCodec = enumCodec<FileSortField>(['name', 'createdAt', 'lastModified']);
const sortDirectionCodec = enumCodec<SortDirection>(['asc', 'desc']);

/** User preferences kept between sessions (localStorage). The theme is also applied to the page. */
export function usePreferences() {
  const [isDarkMode, setIsDarkMode] = usePersistedState(
    'log-viewer-theme',
    () => document.documentElement.classList.contains('dark'),
    themeCodec
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode]);

  const [wordWrap, setWordWrap] = usePersistedState('log-viewer-word-wrap', false, booleanCodec);
  const [showTimeline, setShowTimeline] = usePersistedState('log-viewer-show-timeline', true, booleanCodec);
  const [notifyErrors, setNotifyErrors] = usePersistedState('log-viewer-notify-errors', false, booleanCodec);
  const [notifyTerms, setNotifyTerms] = usePersistedState('log-viewer-notify-terms', '', stringCodec);
  const [fileSortField, setFileSortField] = usePersistedState<FileSortField>('log-viewer-file-sort-field', 'name', fileSortFieldCodec);
  const [sortDirection, setSortDirection] = usePersistedState<SortDirection>('log-viewer-file-sort-direction', 'asc', sortDirectionCodec);
  const [highlightRules, setHighlightRules] = usePersistedState<HighlightRule[]>('log-viewer-highlight-rules-v1', [], highlightRulesCodec);

  return {
    isDarkMode, setIsDarkMode,
    wordWrap, setWordWrap,
    showTimeline, setShowTimeline,
    notifyErrors, setNotifyErrors,
    notifyTerms, setNotifyTerms,
    fileSortField, setFileSortField,
    sortDirection, setSortDirection,
    highlightRules, setHighlightRules,
  };
}
