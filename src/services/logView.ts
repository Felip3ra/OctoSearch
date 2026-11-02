import { EntryLogLevel, LogEntry } from '../types';
import { applyLineLimit, createEntryFilter, FilterOptions } from './logSearch';

export type LevelCounts = Record<'ALL' | EntryLogLevel, number>;

/**
 * How many records at the start of `next` are the very same objects as in `previous`.
 * Timelines only change by replacing their tail (a live append replaces the provisional last
 * record and adds new ones) or completely (a new parse or merge creates new objects), so the
 * shared part is a prefix and can be found by binary search.
 */
export function sharedPrefixLength(previous: LogEntry[], next: LogEntry[]): number {
  const max = Math.min(previous.length, next.length);
  if (max === 0 || previous[0] !== next[0]) return 0;
  let low = 0;
  let high = max - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (previous[middle] === next[middle]) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/** The options that decide which records match (the line limit is applied afterwards). */
function matchKey(options: FilterOptions): unknown[] {
  return [options.searchTerm, options.searchMode, options.searchFilters, options.includeOperator, options.level, options.timeFrom, options.timeTo];
}

/**
 * Filters the timeline and remembers the result, so a live update with the same filters only
 * tests the new records instead of millions of old ones.
 */
export class IncrementalFilter {
  private source: LogEntry[] = [];
  private key: unknown[] | null = null;
  private matches: LogEntry[] = [];

  apply(entries: LogEntry[], options: FilterOptions): LogEntry[] {
    const key = matchKey(options);
    const predicate = createEntryFilter(options);
    let matches = entries;
    if (predicate) {
      const sameFilters = this.key !== null && key.every((value, index) => value === this.key![index]);
      const kept = sameFilters ? sharedPrefixLength(this.source, entries) : 0;
      if (kept > 0) {
        // Drop the matches that came from the replaced tail, then test only what is new.
        const replaced = new Set(this.source.slice(kept));
        let end = this.matches.length;
        while (end > 0 && replaced.has(this.matches[end - 1])) end--;
        matches = this.matches.slice(0, end);
        for (let index = kept; index < entries.length; index++) {
          if (predicate(entries[index])) matches.push(entries[index]);
        }
      } else {
        matches = entries.filter(predicate);
      }
    }
    this.source = entries;
    this.key = key;
    this.matches = matches;
    return applyLineLimit(matches, options);
  }
}

/** Records per level, updated with only the records that changed since the previous timeline. */
export class IncrementalLevelCounter {
  private source: LogEntry[] = [];
  private counts: LevelCounts = { ALL: 0, INF: 0, WRN: 0, ERR: 0, DBG: 0, OTHER: 0 };

  count(entries: LogEntry[]): LevelCounts {
    const kept = sharedPrefixLength(this.source, entries);
    const counts: LevelCounts = kept > 0 ? { ...this.counts } : { ALL: 0, INF: 0, WRN: 0, ERR: 0, DBG: 0, OTHER: 0 };
    if (kept > 0) {
      for (let index = kept; index < this.source.length; index++) counts[this.source[index].level]--;
    }
    for (let index = kept; index < entries.length; index++) counts[entries[index].level]++;
    counts.ALL = entries.length;
    this.source = entries;
    this.counts = counts;
    return counts;
  }
}
