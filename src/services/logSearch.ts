import { LogEntry, LogLevel, SearchFilter, SearchMode } from '../types';

export interface FilterOptions {
  searchTerm: string;
  searchMode?: SearchMode;
  searchFilters?: SearchFilter[];
  level: LogLevel;
  lineLimit?: string;
  customLineLimit?: number;
  lineLimitDirection?: 'tail' | 'head';
}

/**
 * Filters log entries by level, text search, and line count limit.
 * Preserves matches within stack traces along with full entry context.
 */
export function filterLogEntries(
  entries: LogEntry[],
  options: FilterOptions
): LogEntry[] {
  const {
    searchTerm,
    searchMode = 'include',
    searchFilters = [],
    level,
    lineLimit = 'ALL',
    customLineLimit = 100,
    lineLimitDirection = 'tail',
  } = options;
  let normalizedFilters: SearchFilter[] = [];
  if (searchFilters.length > 0) {
    normalizedFilters = searchFilters
      .map((filter) => ({ ...filter, text: filter.text.trim().toLowerCase() }))
      .filter((filter) => filter.text.length > 0);
  } else if (searchTerm.trim().length > 0) {
    normalizedFilters = [
      { id: 'legacy-search', text: searchTerm.trim().toLowerCase(), mode: searchMode },
    ];
  }
  const includeTerms = normalizedFilters.filter((filter) => filter.mode === 'include');
  const excludeTerms = normalizedFilters.filter((filter) => filter.mode === 'exclude');

  const filtered = entries.filter((entry) => {
    // 1. Level filter
    if (level !== 'ALL' && entry.level !== level) {
      return false;
    }

    // 2. Text search filter
    if (normalizedFilters.length === 0) {
      return true;
    }

    const searchableText = [
      entry.message,
      entry.timestamp,
      entry.rawLevel,
      entry.sourceFile || '',
      ...entry.stackTrace,
    ].join('\n').toLowerCase();

    // Inclusions are alternatives (OR): a record needs at least one of them.
    // Exclusions hide a record when any of them is present.
    const matchesAnyInclusion =
      includeTerms.length === 0 ||
      includeTerms.some((filter) => searchableText.includes(filter.text));
    const matchesAnyExclusion = excludeTerms.some((filter) =>
      searchableText.includes(filter.text)
    );

    return matchesAnyInclusion && !matchesAnyExclusion;
  });

  // 3. Line count limit filter
  if (lineLimit && lineLimit !== 'ALL') {
    let limitCount = 0;
    if (lineLimit === 'custom') {
      limitCount = Math.max(1, customLineLimit || 100);
    } else {
      limitCount = Number.parseInt(lineLimit, 10);
    }

    if (!Number.isNaN(limitCount) && limitCount > 0 && limitCount < filtered.length) {
      if (lineLimitDirection === 'tail') {
        // Return the last N items (e.g., tail -n)
        return filtered.slice(-limitCount);
      } else {
        // Return the first N items
        return filtered.slice(0, limitCount);
      }
    }
  }

  return filtered;
}

export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

/**
 * Splits text into highlighted segments based on a search term.
 */
export function splitTextWithHighlight(
  text: string,
  searchTerm: string
): HighlightSegment[] {
  return splitTextWithHighlights(text, [searchTerm]);
}

/** Splits text into highlighted segments for any of the supplied terms. */
export function splitTextWithHighlights(
  text: string,
  searchTerms: string[]
): HighlightSegment[] {
  const terms = [...new Set(searchTerms.map((term) => term.trim().toLowerCase()).filter(Boolean))];
  if (terms.length === 0 || !text) {
    return [{ text, isMatch: false }];
  }

  const result: HighlightSegment[] = [];
  const textLower = text.toLowerCase();
  let currentIndex = 0;

  while (currentIndex < text.length) {
    let matchIndex = -1;
    let matchedTerm = '';
    for (const term of terms) {
      const candidateIndex = textLower.indexOf(term, currentIndex);
      if (
        candidateIndex !== -1 &&
        (matchIndex === -1 || candidateIndex < matchIndex || (candidateIndex === matchIndex && term.length > matchedTerm.length))
      ) {
        matchIndex = candidateIndex;
        matchedTerm = term;
      }
    }

    if (matchIndex === -1) {
      result.push({
        text: text.slice(currentIndex),
        isMatch: false,
      });
      break;
    }

    if (matchIndex > currentIndex) {
      result.push({
        text: text.slice(currentIndex, matchIndex),
        isMatch: false,
      });
    }

    result.push({
      text: text.slice(matchIndex, matchIndex + matchedTerm.length),
      isMatch: true,
    });

    currentIndex = matchIndex + matchedTerm.length;
  }

  return result;
}
