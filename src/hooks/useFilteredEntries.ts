import { useMemo, useState } from 'react';
import { LogEntry } from '../types';
import { IncrementalHistogram } from '../services/logHistogram';
import { IncrementalFilter, IncrementalLevelCounter } from '../services/logView';
import { TabFilters } from './useTabFilters';

/**
 * The filtering pipeline of the viewer. Each step is an incremental object that remembers its
 * previous input, so a live update only processes the records that changed; they live in useState
 * (created once per mount) and are called from useMemo, which is where their cache is refreshed.
 */
export function useFilteredEntries(entries: LogEntry[], filters: TabFilters, showTimeline: boolean) {
  const [textFilter] = useState(() => new IncrementalFilter());
  const [periodFilter] = useState(() => new IncrementalFilter());
  const [levelCounter] = useState(() => new IncrementalLevelCounter());
  const [histogramBuilder] = useState(() => new IncrementalHistogram());
  const { searchMode, searchFilters, includeOperator, levelFilter, lineLimit, customLineLimit, lineLimitDirection, timeFrom, timeTo } = filters;

  // Two steps: terms and level first (what the timeline shows), then the period and the line limit.
  const entriesBeforePeriod = useMemo(
    () => textFilter.apply(entries, { searchTerm: '', searchMode, searchFilters, includeOperator, level: levelFilter }),
    [textFilter, entries, searchMode, searchFilters, includeOperator, levelFilter]
  );

  const filteredEntries = useMemo(
    () => periodFilter.apply(entriesBeforePeriod, { searchTerm: '', level: 'ALL', lineLimit, customLineLimit, lineLimitDirection, timeFrom, timeTo }),
    [periodFilter, entriesBeforePeriod, lineLimit, customLineLimit, lineLimitDirection, timeFrom, timeTo]
  );

  const histogram = useMemo(
    () => (showTimeline ? histogramBuilder.compute(entriesBeforePeriod) : null),
    [showTimeline, histogramBuilder, entriesBeforePeriod]
  );

  const levelCounts = useMemo(() => levelCounter.count(entries), [levelCounter, entries]);

  const latestEntryTime = useMemo(() => {
    for (let index = entries.length - 1; index >= 0; index--) {
      const time = entries[index].time;
      if (time !== undefined) return time;
    }
    return undefined;
  }, [entries]);

  return { filteredEntries, histogram, levelCounts, latestEntryTime };
}
