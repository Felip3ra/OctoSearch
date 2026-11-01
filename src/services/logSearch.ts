import { FilterOperator, LogEntry, LogLevel, SearchFilter, SearchMode, SearchPattern } from '../types';

export interface FilterOptions {
  searchTerm: string;
  searchMode?: SearchMode;
  searchFilters?: SearchFilter[];
  /** Connector used by included terms that have none of their own (default 'or'). */
  includeOperator?: FilterOperator;
  level: LogLevel;
  lineLimit?: string;
  customLineLimit?: number;
  lineLimitDirection?: 'tail' | 'head';
  /** Keeps only dated records inside the range (epoch ms, inclusive). */
  timeFrom?: number;
  timeTo?: number;
}

/** Returns the error message of an invalid regular expression, or null when the pattern is usable. */
export function getPatternError(pattern: SearchPattern): string | null {
  if (!pattern.regex) return null;
  try {
    RegExp(pattern.text);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/**
 * Builds a predicate for one pattern. It receives the text and its lowercase form, so callers that
 * test many patterns against the same text only lowercase it once. Invalid regexes never match.
 */
export function createPatternMatcher(pattern: SearchPattern): (text: string, lowerText?: string) => boolean {
  const term = pattern.text.trim();
  if (!term) return () => false;
  if (pattern.regex) {
    let regex: RegExp;
    try {
      regex = new RegExp(term, pattern.caseSensitive ? 'u' : 'iu');
    } catch {
      try {
        regex = new RegExp(term, pattern.caseSensitive ? '' : 'i');
      } catch {
        return () => false;
      }
    }
    return (text) => regex.test(text);
  }
  if (pattern.caseSensitive) return (text) => text.includes(term);
  const lowerTerm = term.toLowerCase();
  return (text, lowerText) => (lowerText ?? text.toLowerCase()).includes(lowerTerm);
}

/** Compiles the patterns once into a predicate that is true when any of them matches. */
export function createAnyPatternMatcher(patterns: SearchPattern[]): (text: string) => boolean {
  const matchers = patterns.map(createPatternMatcher);
  if (matchers.length === 0) return () => false;
  return (text) => {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return matchers.some((matches) => matches(text, lowerText));
  };
}

/** True when the text matches at least one of the patterns. */
export function textMatchesAny(text: string, patterns: SearchPattern[]): boolean {
  return createAnyPatternMatcher(patterns)(text);
}

/**
 * Groups included terms into blocks joined by OR; terms inside a block are joined by AND.
 * A term whose connector is OR starts a new block, so "a E b OU c E d" becomes [[a, b], [c, d]].
 */
export function getIncludeBlocks(
  filters: SearchFilter[],
  defaultOperator: FilterOperator = 'or'
): SearchFilter[][] {
  const blocks: SearchFilter[][] = [];
  for (const filter of filters) {
    if (filter.mode !== 'include') continue;
    const connector = filter.connector ?? defaultOperator;
    if (blocks.length === 0 || connector === 'or') blocks.push([filter]);
    else blocks[blocks.length - 1].push(filter);
  }
  return blocks;
}

/**
 * Filters log entries by level, date range, text search, and line count limit.
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
    includeOperator = 'or',
    level,
    lineLimit = 'ALL',
    customLineLimit = 100,
    lineLimitDirection = 'tail',
    timeFrom,
    timeTo,
  } = options;
  let normalizedFilters: SearchFilter[] = [];
  if (searchFilters.length > 0) {
    normalizedFilters = searchFilters
      .map((filter) => ({ ...filter, text: filter.text.trim() }))
      .filter((filter) => filter.text.length > 0);
  } else if (searchTerm.trim().length > 0) {
    normalizedFilters = [
      { id: 'legacy-search', text: searchTerm.trim(), mode: searchMode },
    ];
  }
  const matchers = new Map(normalizedFilters.map((filter) => [filter.id, createPatternMatcher(filter)]));
  const includeBlocks = getIncludeBlocks(normalizedFilters, includeOperator);
  const excludeTerms = normalizedFilters.filter((filter) => filter.mode === 'exclude');
  const hasTimeRange = timeFrom !== undefined || timeTo !== undefined;

  // Nothing to filter: keep the same array (cheap for multi-million-record live views).
  const filtered = level === 'ALL' && !hasTimeRange && normalizedFilters.length === 0 ? entries : entries.filter((entry) => {
    // 1. Level filter
    if (level !== 'ALL' && entry.level !== level) {
      return false;
    }

    // 2. Date range: records without a date cannot be placed in it
    if (hasTimeRange) {
      if (entry.time === undefined) return false;
      if (timeFrom !== undefined && entry.time < timeFrom) return false;
      if (timeTo !== undefined && entry.time > timeTo) return false;
    }

    // 3. Text search filter
    if (normalizedFilters.length === 0) {
      return true;
    }

    const searchableText = [
      entry.message,
      entry.timestamp,
      entry.rawLevel,
      entry.sourceFile || '',
      ...entry.stackTrace,
    ].join('\n');
    const lowerText = searchableText.toLowerCase();

    // A record matches when every term of at least one block is present (AND inside, OR between blocks).
    // Exclusions hide a record when any of them is present.
    const containsTerm = (filter: SearchFilter) => matchers.get(filter.id)!(searchableText, lowerText);
    const matchesInclusions =
      includeBlocks.length === 0 || includeBlocks.some((block) => block.every(containsTerm));
    const matchesAnyExclusion = excludeTerms.some(containsTerm);

    return matchesInclusions && !matchesAnyExclusion;
  });

  // 4. Line count limit filter
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

type HighlightTerm = string | SearchPattern;

function findMatchRanges(text: string, lowerText: string, term: HighlightTerm): [number, number][] {
  const pattern = typeof term === 'string' ? { text: term } : term;
  const needle = pattern.text.trim();
  if (!needle) return [];
  const ranges: [number, number][] = [];

  if (pattern.regex) {
    let regex: RegExp;
    try {
      regex = new RegExp(needle, pattern.caseSensitive ? 'gu' : 'giu');
    } catch {
      try {
        regex = new RegExp(needle, pattern.caseSensitive ? 'g' : 'gi');
      } catch {
        return [];
      }
    }
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text))) {
      if (match[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      ranges.push([match.index, match.index + match[0].length]);
    }
    return ranges;
  }

  const haystack = pattern.caseSensitive ? text : lowerText;
  const target = pattern.caseSensitive ? needle : needle.toLowerCase();
  let index = haystack.indexOf(target);
  while (index !== -1) {
    ranges.push([index, index + target.length]);
    index = haystack.indexOf(target, index + target.length);
  }
  return ranges;
}

/** Splits text into highlighted segments for any of the supplied terms (plain text or patterns). */
export function splitTextWithHighlights(
  text: string,
  searchTerms: HighlightTerm[]
): HighlightSegment[] {
  if (searchTerms.length === 0 || !text) {
    return [{ text, isMatch: false }];
  }

  const lowerText = text.toLowerCase();
  // Earliest match wins; on the same start the longest one does. Overlaps merge into one highlight.
  const ranges = searchTerms
    .flatMap((term) => findMatchRanges(text, lowerText, term))
    .sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  if (ranges.length === 0) return [{ text, isMatch: false }];

  const result: HighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    const from = Math.max(start, cursor);
    if (from > cursor) result.push({ text: text.slice(cursor, from), isMatch: false });
    result.push({ text: text.slice(from, end), isMatch: true });
    cursor = end;
  }
  if (cursor < text.length) result.push({ text: text.slice(cursor), isMatch: false });
  return result;
}
