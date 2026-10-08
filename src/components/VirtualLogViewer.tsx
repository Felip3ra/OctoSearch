import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { HighlightRule, LogEntry } from '../types';
import { LogEntryRow } from './LogEntryRow';
import { SearchX, ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { normalizeHighlightColor } from '../utils/highlightColor';

interface VirtualLogViewerProps {
  entries: LogEntry[];
  allEntries?: LogEntry[];
  searchTerms: string[];
  autoScroll?: boolean;
  highlightRules?: HighlightRule[];
  wordWrap?: boolean;
  /** Badge color per source file label (merged view). */
  sourceColors?: Map<string, string>;
  emptyTitle?: string;
  emptyDescription?: string;
}

const floatingButtonClass =
  'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-600 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white';

const BASE_ROW_HEIGHT = 34;
const LINE_HEIGHT_STACK = 21;
const STACK_CONTAINER_PADDING = 38;
const OVERSCAN = 15;

export function VirtualLogViewer({
  entries,
  allEntries = entries,
  searchTerms,
  autoScroll = false,
  highlightRules = [],
  wordWrap = false,
  sourceColors,
  emptyTitle = 'Nenhum registro encontrado',
  emptyDescription = 'Nenhum registro corresponde aos filtros aplicados.',
}: Readonly<VirtualLogViewerProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());
  const prevCountRef = useRef(entries.length);

  // Auto-expand items when searching inside their stack trace
  useEffect(() => {
    if (searchTerms.length === 0) return;
    const lowerSearchTerms = searchTerms.map((term) => term.toLowerCase());
    const matchingIds = new Set<number>();

    entries.forEach((entry) => {
      if (
        entry.hasStackTrace &&
        entry.stackTrace.some((line) =>
          lowerSearchTerms.some((term) => line.toLowerCase().includes(term))
        )
      ) {
        matchingIds.add(entry.id);
      }
    });

    if (matchingIds.size > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        matchingIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [searchTerms, entries]);

  // Keep container height updated on resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      setContainerHeight(el.clientHeight || 600);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const handleToggleExpand = useCallback((id: number) => {
    setMeasuredHeights((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setMeasuredHeights(new Map());
  }, [wordWrap, entries]);

  const handleHeightChange = useCallback((id: number, height: number) => {
    setMeasuredHeights((previous) => {
      const roundedHeight = Math.max(BASE_ROW_HEIGHT, Math.ceil(height));
      if (previous.get(id) === roundedHeight) return previous;
      const next = new Map(previous);
      next.set(id, roundedHeight);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    const all = new Set<number>();
    entries.forEach((e) => {
      if (e.hasStackTrace) all.add(e.id);
    });
    setExpandedIds(all);
  }, [entries]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // Compute row heights and cumulative positions taking expansions into account
  const { positions, totalHeight } = useMemo(() => {
    const count = entries.length;
    const pos = new Float64Array(count);
    let currentY = 0;

    for (let i = 0; i < count; i++) {
      pos[i] = currentY;
      const entry = entries[i];
      let rowH = wordWrap ? measuredHeights.get(entry.id) || BASE_ROW_HEIGHT : BASE_ROW_HEIGHT;
      if (!wordWrap && entry.hasStackTrace && expandedIds.has(entry.id)) {
        rowH += STACK_CONTAINER_PADDING + entry.stackTrace.length * LINE_HEIGHT_STACK;
      }
      currentY += rowH;
    }

    return { positions: pos, totalHeight: currentY };
  }, [entries, expandedIds, measuredHeights, wordWrap]);

  // Auto-scroll to bottom when new entries arrive if autoScroll is enabled
  useEffect(() => {
    if (autoScroll && entries.length > 0) {
      const el = containerRef.current;
      if (el) {
        el.scrollTop = totalHeight;
      }
    }
    prevCountRef.current = entries.length;
  }, [entries.length, autoScroll, totalHeight]);

  // Binary search to find start index
  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const count = entries.length;
    if (count === 0) {
      return { startIndex: 0, endIndex: 0, offsetY: 0 };
    }

    // Binary search for first item where position + height >= scrollTop
    let low = 0;
    let high = count - 1;
    let start = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (positions[mid] < scrollTop) {
        start = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    start = Math.max(0, start - OVERSCAN);

    // Find end index
    const targetY = scrollTop + containerHeight;
    let end = start;
    while (end < count && positions[end] < targetY) {
      end++;
    }
    end = Math.min(count, end + OVERSCAN);

    return {
      startIndex: start,
      endIndex: end,
      offsetY: positions[start] || 0,
    };
  }, [entries.length, positions, scrollTop, containerHeight]);

  const visibleEntries = useMemo(() => {
    return entries.slice(startIndex, endIndex);
  }, [entries, startIndex, endIndex]);

  const allEntryIndex = useMemo(() => {
    const index = new Map<number, number>();
    allEntries.forEach((entry, position) => index.set(entry.id, position));
    return index;
  }, [allEntries]);

  const filteredEntryIds = useMemo(() => new Set(entries.map((entry) => entry.id)), [entries]);

  const minimapItems = useMemo(() => {
    if (allEntries.length === 0) return [];

    const sampledIndexes = new Set<number>();
    const backgroundStep = Math.max(1, Math.ceil(allEntries.length / 360));
    for (let index = 0; index < allEntries.length; index += backgroundStep) {
      sampledIndexes.add(index);
    }

    const filteredStep = Math.max(1, Math.ceil(entries.length / 420));
    for (let index = 0; index < entries.length; index += filteredStep) {
      const originalIndex = allEntryIndex.get(entries[index].id);
      if (originalIndex !== undefined) sampledIndexes.add(originalIndex);
    }

    return Array.from(sampledIndexes)
      .sort((a, b) => a - b)
      .map((index) => {
        const entry = allEntries[index];
        const highlightRule = highlightRules.find((rule) => {
          if (!rule.enabled || !rule.text) return false;
          return rule.caseSensitive
            ? entry.rawText.includes(rule.text)
            : entry.rawText.toLocaleLowerCase('pt-BR').includes(rule.text.toLocaleLowerCase('pt-BR'));
        });
        const isFiltered = filteredEntryIds.has(entry.id);
        const width = 24 + Math.min(72, Math.round((Math.min(entry.rawText.length, 220) / 220) * 72));
        return {
          id: entry.id,
          top: (index / Math.max(1, allEntries.length - 1)) * 100,
          width,
          isFiltered,
          level: entry.level,
          highlightColor: highlightRule?.color,
        };
      });
  }, [allEntries, allEntryIndex, entries, filteredEntryIds, highlightRules]);

  const viewportBounds = useMemo(() => {
    if (entries.length === 0 || allEntries.length === 0) return { top: 0, height: 100 };

    let firstVisible = 0;
    let low = 0;
    let high = entries.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (positions[middle] <= scrollTop) {
        firstVisible = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    let lastVisible = firstVisible;
    const viewportEnd = scrollTop + containerHeight;
    while (lastVisible < entries.length - 1 && positions[lastVisible] < viewportEnd) {
      lastVisible++;
    }

    const firstOriginal = allEntryIndex.get(entries[firstVisible].id) ?? 0;
    const lastOriginal = allEntryIndex.get(entries[lastVisible].id) ?? firstOriginal;
    const top = (firstOriginal / Math.max(1, allEntries.length)) * 100;
    const rawHeight = ((lastOriginal - firstOriginal + 1) / Math.max(1, allEntries.length)) * 100;
    return { top, height: Math.max(3, Math.min(100 - top, rawHeight)) };
  }, [allEntries.length, allEntryIndex, containerHeight, entries, positions, scrollTop]);

  const handleMinimapClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (!containerRef.current || entries.length === 0 || allEntries.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const targetOriginalIndex = Math.round(ratio * (allEntries.length - 1));

    let low = 0;
    let high = entries.length - 1;
    let closest = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const originalIndex = allEntryIndex.get(entries[middle].id) ?? 0;
      closest = middle;
      if (originalIndex < targetOriginalIndex) low = middle + 1;
      else if (originalIndex > targetOriginalIndex) high = middle - 1;
      else break;
    }

    const previous = Math.max(0, closest - 1);
    const closestOriginal = allEntryIndex.get(entries[closest].id) ?? 0;
    const previousOriginal = allEntryIndex.get(entries[previous].id) ?? 0;
    const targetIndex = Math.abs(previousOriginal - targetOriginalIndex) < Math.abs(closestOriginal - targetOriginalIndex)
      ? previous
      : closest;
    containerRef.current.scrollTo({ top: positions[targetIndex] || 0, behavior: 'smooth' });
  }, [allEntries.length, allEntryIndex, entries, positions]);

  const findHighlightRule = useCallback(
    (entry: LogEntry) =>
      highlightRules.find((rule) => {
        if (!rule.enabled || !rule.text) return false;
        return rule.caseSensitive
          ? entry.rawText.includes(rule.text)
          : entry.rawText.toLocaleLowerCase('pt-BR').includes(rule.text.toLocaleLowerCase('pt-BR'));
      }),
    [highlightRules]
  );

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: totalHeight, behavior: 'smooth' });
    }
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 select-none flex-col items-center justify-center bg-white p-8 text-center dark:bg-slate-900">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700">
          <SearchX className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{emptyTitle}</h3>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">{emptyDescription}</p>
      </div>
    );
  }

  const hasAnyExceptions = entries.some((e) => e.hasStackTrace);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 relative">
      {/* Sticky Quick Nav Buttons - discreetly tucked in corner */}
      <div className="absolute bottom-4 right-6 z-20 flex flex-col gap-1 opacity-70 transition-opacity hover:opacity-100 md:right-20">
        {hasAnyExceptions && (
          <button
            type="button"
            onClick={expandedIds.size > 0 ? handleCollapseAll : handleExpandAll}
            title={expandedIds.size > 0 ? 'Recolher todas as exceções' : 'Expandir todas as exceções'}
            className={floatingButtonClass}
          >
            <ChevronsUpDown className="h-3.5 w-3.5 text-rose-500" />
          </button>
        )}
        <button type="button" onClick={scrollToTop} title="Ir para o início" className={floatingButtonClass}>
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={scrollToBottom} title="Ir para o final" className={floatingButtonClass}>
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 min-w-0">
        {/* Main Virtualized Scroll Container */}
        <div
          ref={containerRef}
          id="virtual-log-scroll-container"
          onScroll={handleScroll}
          className="flex-1 min-w-0 overflow-auto overscroll-contain will-change-transform"
          style={{ position: 'relative' }}
        >
          {/* Placeholder element to set total scroll height */}
          <div style={{ height: `${totalHeight}px`, width: '100%', position: 'relative' }}>
            {/* Slice of rendered items */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${offsetY}px)`,
              }}
            >
              {visibleEntries.map((entry) => (
                <LogEntryRow
                  key={entry.id}
                  entry={entry}
                  searchTerms={searchTerms}
                  isExpanded={expandedIds.has(entry.id)}
                  onToggleExpand={() => handleToggleExpand(entry.id)}
                  highlightRule={findHighlightRule(entry)}
                  wordWrap={wordWrap}
                  sourceColor={entry.sourceFile ? sourceColors?.get(entry.sourceFile) : undefined}
                  onHeightChange={wordWrap ? handleHeightChange : undefined}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Scroll preview / minimap inspired by code editors. */}
        <button
          type="button"
          className="relative hidden w-14 shrink-0 cursor-pointer overflow-hidden border-l border-slate-200 bg-slate-50 md:block dark:border-slate-800 dark:bg-slate-950/70"
          onClick={handleMinimapClick}
          title="Prévia do log: clique para navegar"
          role="scrollbar"
          aria-controls="virtual-log-scroll-container"
          aria-label="Prévia de rolagem do log"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, allEntries.length - 1)}
          aria-valuenow={allEntryIndex.get(entries[Math.min(entries.length - 1, startIndex)]?.id) || 0}
        >
          <div className="absolute inset-y-0 left-1 right-2 overflow-hidden opacity-80">
            {minimapItems.map((item) => {
              const highlightColor = normalizeHighlightColor(item.highlightColor);
              let highlightClass = 'bg-slate-400/35 dark:bg-slate-500/35';
              if (highlightColor) {
                highlightClass = '';
              } else if (item.isFiltered) {
                highlightClass = 'bg-cyan-400 dark:bg-cyan-500';
              } else if (item.level === 'ERR') {
                highlightClass = 'bg-rose-400/70';
              } else if (item.level === 'WRN') {
                highlightClass = 'bg-amber-400/60';
              }
              return (
                <span
                  key={`${item.id}-${item.top}`}
                  className={`absolute left-0 h-px rounded-full ${highlightClass}`}
                  style={{
                    top: `${item.top}%`,
                    width: `${item.width}%`,
                    backgroundColor: highlightColor || undefined,
                  }}
                />
              );
            })}
          </div>

          <div className="absolute inset-y-0 right-0 w-1.5 bg-slate-200/70 dark:bg-slate-800/80">
            {minimapItems.filter((item) => item.isFiltered || item.highlightColor).map((item) => (
              <span
                key={`marker-${item.id}-${item.top}`}
                className="absolute right-0 h-[2px] w-full bg-cyan-400"
                style={{
                  top: `${item.top}%`,
                  backgroundColor: normalizeHighlightColor(item.highlightColor) || undefined,
                }}
              />
            ))}
          </div>

          <div
            className="pointer-events-none absolute left-0 right-1.5 border border-sky-400/90 bg-sky-300/15 shadow-[0_0_0_1px_rgba(14,165,233,0.12)]"
            style={{ top: `${viewportBounds.top}%`, height: `${viewportBounds.height}%` }}
          />
        </button>
      </div>
    </div>
  );
}
