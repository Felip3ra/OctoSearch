import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { HighlightRule, LogEntry, SearchPattern } from '../types';
import { createAnyPatternMatcher } from '../services/logSearch';
import { entryKey, entryStackTrace, hasStackTrace } from '../services/logEntry';
import { sharedPrefixLength } from '../services/logView';
import { LogEntryRow } from './LogEntryRow';
import { SearchX, ArrowDown, ArrowUp, ChevronsUpDown, CornerDownLeft } from 'lucide-react';
import { normalizeHighlightColor } from '../utils/highlightColor';

interface VirtualLogViewerProps {
  entries: LogEntry[];
  allEntries?: LogEntry[];
  searchTerms: SearchPattern[];
  autoScroll?: boolean;
  highlightRules?: HighlightRule[];
  wordWrap?: boolean;
  /** Badge color per source file label (merged view). */
  sourceColors?: Map<string, string>;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Scrolls to this record and makes it the active row (a new nonce repeats the request). */
  navigateTo?: { entryId: number; nonce: number } | null;
  bookmarkedKeys?: ReadonlySet<string>;
  onToggleBookmark?: (entry: LogEntry) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.isContentEditable));
}

const floatingButtonClass =
  'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-600 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white';

const BASE_ROW_HEIGHT = 34;
const LINE_HEIGHT_STACK = 21;
const STACK_CONTAINER_PADDING = 38;
const OVERSCAN = 15;
// Browsers cap element heights (~33.5M px in Chromium). Taller lists are drawn in a shorter scroll
// area and the scroll position is mapped proportionally onto the real row positions.
const MAX_SCROLL_HEIGHT = 10_000_000;

/**
 * Row positions of the whole list. A row's height only depends on its own record and on the
 * expansion/measurement state, so when only the tail of the list changed (live updates) the
 * positions of the unchanged rows are copied instead of being computed again.
 */
class RowLayout {
  private entries: LogEntry[] = [];
  private inputs: unknown[] = [];
  private positions = new Float64Array(0);
  private totalHeight = 0;
  /** Index of the first record with a stack trace (Infinity when there is none). */
  private firstException = Infinity;

  compute(entries: LogEntry[], expandedIds: Set<number>, measuredHeights: Map<number, number>, wordWrap: boolean) {
    const inputs = [expandedIds, measuredHeights, wordWrap];
    const sameInputs = inputs.every((value, index) => value === this.inputs[index]);
    const kept = sameInputs ? sharedPrefixLength(this.entries, entries) : 0;
    const positions = new Float64Array(entries.length);
    let currentY = 0;
    let firstException = Infinity;
    if (kept > 0) {
      positions.set(this.positions.subarray(0, kept));
      currentY = kept < this.entries.length ? this.positions[kept] : this.totalHeight;
      if (this.firstException < kept) firstException = this.firstException;
    }

    for (let i = kept; i < entries.length; i++) {
      positions[i] = currentY;
      const entry = entries[i];
      let rowH = wordWrap ? measuredHeights.get(entry.id) || BASE_ROW_HEIGHT : BASE_ROW_HEIGHT;
      if (entry.stackLines > 0) {
        if (firstException === Infinity) firstException = i;
        if (!wordWrap && expandedIds.has(entry.id)) rowH += STACK_CONTAINER_PADDING + entry.stackLines * LINE_HEIGHT_STACK;
      }
      currentY += rowH;
    }

    this.entries = entries;
    this.inputs = inputs;
    this.positions = positions;
    this.totalHeight = currentY;
    this.firstException = firstException;
    return { positions, totalHeight: currentY, hasAnyExceptions: firstException !== Infinity };
  }
}

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
  navigateTo,
  bookmarkedKeys,
  onToggleBookmark,
}: Readonly<VirtualLogViewerProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());
  const prevCountRef = useRef(entries.length);
  /** Row the keyboard shortcuts start from (last clicked or navigated to). */
  const [activeId, setActiveId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isGoToLineOpen, setIsGoToLineOpen] = useState(false);
  const [goToLineValue, setGoToLineValue] = useState('');

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  // Auto-expand items when searching inside their stack trace
  useEffect(() => {
    if (searchTerms.length === 0) return;
    const matches = createAnyPatternMatcher(searchTerms);
    const matchingIds = new Set<number>();

    entries.forEach((entry) => {
      if (hasStackTrace(entry) && entryStackTrace(entry).some(matches)) {
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
      if (hasStackTrace(e)) all.add(e.id);
    });
    setExpandedIds(all);
  }, [entries]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // Compute row heights and cumulative positions taking expansions into account
  const [rowLayout] = useState(() => new RowLayout());
  const { positions, totalHeight, hasAnyExceptions } = useMemo(
    () => rowLayout.compute(entries, expandedIds, measuredHeights, wordWrap),
    [rowLayout, entries, expandedIds, measuredHeights, wordWrap]
  );

  const scrollHeight = Math.min(totalHeight, MAX_SCROLL_HEIGHT);
  const scrollRatio =
    totalHeight > scrollHeight && scrollHeight > containerHeight
      ? (totalHeight - containerHeight) / (scrollHeight - containerHeight)
      : 1;
  /** Position in the full (unscaled) list that is shown at the top of the viewport. */
  const virtualScrollTop = scrollTop * scrollRatio;
  const toScrollTop = useCallback((virtualY: number) => virtualY / scrollRatio, [scrollRatio]);

  // Auto-scroll to bottom when new entries arrive if autoScroll is enabled
  useEffect(() => {
    if (autoScroll && entries.length > 0) {
      const el = containerRef.current;
      if (el) {
        el.scrollTop = scrollHeight;
      }
    }
    prevCountRef.current = entries.length;
  }, [entries.length, autoScroll, scrollHeight]);

  // Binary search to find start index
  const { startIndex, endIndex, offsetY, firstVisibleIndex } = useMemo(() => {
    const count = entries.length;
    if (count === 0) {
      return { startIndex: 0, endIndex: 0, offsetY: 0, firstVisibleIndex: 0 };
    }

    // Binary search for first item where position + height >= scrollTop
    let low = 0;
    let high = count - 1;
    let start = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (positions[mid] < virtualScrollTop) {
        start = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const firstVisible = start;
    start = Math.max(0, start - OVERSCAN);

    // Find end index
    const targetY = virtualScrollTop + containerHeight;
    let end = start;
    while (end < count && positions[end] < targetY) {
      end++;
    }
    end = Math.min(count, end + OVERSCAN);

    return {
      startIndex: start,
      endIndex: end,
      // Rows are placed relative to the real scroll position, so scaling never shows.
      offsetY: scrollTop + (positions[start] || 0) - virtualScrollTop,
      firstVisibleIndex: firstVisible,
    };
  }, [entries.length, positions, scrollTop, virtualScrollTop, containerHeight]);

  const visibleEntries = useMemo(() => {
    return entries.slice(startIndex, endIndex);
  }, [entries, startIndex, endIndex]);

  // Ids are usually the 1-based position in the timeline; the full map is only built when they are not.
  const indexOfEntry = useMemo(() => {
    const count = allEntries.length;
    const sequential = count === 0 || (allEntries[0].id === 1 && allEntries[count - 1].id === count);
    const indexById = sequential ? null : new Map(allEntries.map((entry, position) => [entry.id, position]));
    return (id: number): number | undefined => {
      if (indexById) return indexById.get(id);
      return allEntries[id - 1]?.id === id ? id - 1 : undefined;
    };
  }, [allEntries]);

  // The filtered list keeps the timeline order, so membership is a binary search over it
  // (no need to index hundreds of thousands of ids on every live update).
  const isShown = useCallback(
    (timelineIndex: number): boolean => {
      if (entries.length === allEntries.length) return true;
      let low = 0;
      let high = entries.length - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const index = indexOfEntry(entries[middle].id) ?? -1;
        if (index === timelineIndex) return true;
        if (index < timelineIndex) low = middle + 1;
        else high = middle - 1;
      }
      return false;
    },
    [entries, allEntries.length, indexOfEntry]
  );

  const minimapItems = useMemo(() => {
    if (allEntries.length === 0) return [];

    const sampledIndexes = new Set<number>();
    const backgroundStep = Math.max(1, Math.ceil(allEntries.length / 360));
    for (let index = 0; index < allEntries.length; index += backgroundStep) {
      sampledIndexes.add(index);
    }

    const filteredStep = Math.max(1, Math.ceil(entries.length / 420));
    for (let index = 0; index < entries.length; index += filteredStep) {
      const originalIndex = indexOfEntry(entries[index].id);
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
        const isFiltered = isShown(index);
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
  }, [allEntries, indexOfEntry, entries, isShown, highlightRules]);

  const viewportBounds = useMemo(() => {
    if (entries.length === 0 || allEntries.length === 0) return { top: 0, height: 100 };

    let firstVisible = 0;
    let low = 0;
    let high = entries.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (positions[middle] <= virtualScrollTop) {
        firstVisible = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    let lastVisible = firstVisible;
    const viewportEnd = virtualScrollTop + containerHeight;
    while (lastVisible < entries.length - 1 && positions[lastVisible] < viewportEnd) {
      lastVisible++;
    }

    const firstOriginal = indexOfEntry(entries[firstVisible].id) ?? 0;
    const lastOriginal = indexOfEntry(entries[lastVisible].id) ?? firstOriginal;
    const top = (firstOriginal / Math.max(1, allEntries.length)) * 100;
    const rawHeight = ((lastOriginal - firstOriginal + 1) / Math.max(1, allEntries.length)) * 100;
    return { top, height: Math.max(3, Math.min(100 - top, rawHeight)) };
  }, [allEntries.length, indexOfEntry, containerHeight, entries, positions, virtualScrollTop]);

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
      const originalIndex = indexOfEntry(entries[middle].id) ?? 0;
      closest = middle;
      if (originalIndex < targetOriginalIndex) low = middle + 1;
      else if (originalIndex > targetOriginalIndex) high = middle - 1;
      else break;
    }

    const previous = Math.max(0, closest - 1);
    const closestOriginal = indexOfEntry(entries[closest].id) ?? 0;
    const previousOriginal = indexOfEntry(entries[previous].id) ?? 0;
    const targetIndex = Math.abs(previousOriginal - targetOriginalIndex) < Math.abs(closestOriginal - targetOriginalIndex)
      ? previous
      : closest;
    containerRef.current.scrollTo({ top: toScrollTop(positions[targetIndex] || 0), behavior: 'smooth' });
  }, [allEntries.length, indexOfEntry, entries, positions, toScrollTop]);

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

  /** Brings a row into view (a third from the top) and makes it the active one. */
  const showIndex = useCallback(
    (index: number) => {
      const element = containerRef.current;
      if (!element || index < 0 || index >= entries.length) return;
      element.scrollTop = toScrollTop(Math.max(0, positions[index] - containerHeight / 3));
      setActiveId(entries[index].id);
    },
    [entries, positions, containerHeight, toScrollTop]
  );

  useEffect(() => {
    if (!navigateTo) return;
    const index = entries.findIndex((entry) => entry.id === navigateTo.entryId);
    if (index === -1) setNotice('Esse registro está oculto pelos filtros atuais.');
    else showIndex(index);
    // Only a new request navigates; later list updates keep the user's position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateTo]);

  /** Next (or previous) row matching `predicate`, starting after the active/first visible row and wrapping around. */
  const findFrom = useCallback(
    (predicate: (entry: LogEntry) => boolean, direction: 1 | -1): { index: number; wrapped: boolean } | null => {
      const count = entries.length;
      if (count === 0) return null;
      const activeIndex = activeId === null ? -1 : entries.findIndex((entry) => entry.id === activeId);
      const origin = activeIndex !== -1 ? activeIndex : direction === 1 ? firstVisibleIndex - 1 : firstVisibleIndex;
      for (let step = 1; step <= count; step++) {
        const index = (((origin + step * direction) % count) + count) % count;
        if (predicate(entries[index])) {
          const wrapped = direction === 1 ? index <= origin : index >= origin;
          return { index, wrapped };
        }
      }
      return null;
    },
    [entries, activeId, firstVisibleIndex]
  );

  const jump = useCallback(
    (predicate: (entry: LogEntry) => boolean, direction: 1 | -1, emptyMessage: string) => {
      const found = findFrom(predicate, direction);
      if (!found) {
        setNotice(emptyMessage);
        return;
      }
      showIndex(found.index);
      if (found.wrapped) setNotice(direction === 1 ? 'Fim da lista: continuando do início.' : 'Início da lista: continuando do fim.');
    },
    [findFrom, showIndex]
  );

  const goToLine = (line: number) => {
    const index = entries.findIndex((entry) => entry.startLine <= line && line <= entry.endLine);
    if (index !== -1) {
      showIndex(index);
      setIsGoToLineOpen(false);
      return;
    }
    const exists = allEntries.some((entry) => entry.startLine <= line && line <= entry.endLine);
    setNotice(exists ? `A linha ${line} está oculta pelos filtros atuais.` : `A linha ${line} não está no trecho carregado.`);
  };

  // F8 / Shift+F8: next/previous error. F2 / Shift+F2: next/previous marked row.
  // Ctrl+B: mark/unmark the active row. Ctrl+G: go to a line number.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const direction = event.shiftKey ? -1 : 1;
      if (event.key === 'F8') {
        event.preventDefault();
        jump((entry) => entry.level === 'ERR', direction, 'Nenhum erro (ERR) nos registros visíveis.');
      } else if (event.key === 'F2' && bookmarkedKeys) {
        event.preventDefault();
        jump((entry) => bookmarkedKeys.has(entryKey(entry)), direction, 'Nenhum registro marcado. Use Ctrl+B ou o ícone de alfinete para marcar.');
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        setIsGoToLineOpen(true);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && onToggleBookmark && !isTypingTarget(event.target)) {
        event.preventDefault();
        const active = entries.find((entry) => entry.id === activeId) ?? entries[firstVisibleIndex];
        if (active) {
          onToggleBookmark(active);
          setActiveId(active.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jump, bookmarkedKeys, onToggleBookmark, entries, activeId, firstVisibleIndex]);

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: scrollHeight, behavior: 'smooth' });
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

      {isGoToLineOpen && (
        <form
          className="absolute right-6 top-2 z-30 flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-1.5 shadow-lg md:right-20 dark:border-slate-600 dark:bg-slate-800"
          onSubmit={(event) => {
            event.preventDefault();
            const line = Number.parseInt(goToLineValue, 10);
            if (line > 0) goToLine(line);
          }}
        >
          <label htmlFor="go-to-line" className="pl-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">Ir para a linha</label>
          <input
            id="go-to-line"
            type="number"
            min={1}
            autoFocus
            value={goToLineValue}
            onChange={(event) => setGoToLineValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsGoToLineOpen(false);
            }}
            onBlur={() => setIsGoToLineOpen(false)}
            className="h-7 w-24 rounded border border-slate-300 bg-white px-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
          />
          <button type="submit" className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Ir">
            <CornerDownLeft className="h-3.5 w-3.5" />
          </button>
        </form>
      )}

      {notice && (
        <div role="status" className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs text-white shadow-lg dark:bg-slate-100/90 dark:text-slate-900">
          {notice}
        </div>
      )}

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
          <div style={{ height: `${scrollHeight}px`, width: '100%', position: 'relative' }}>
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
                  isActive={entry.id === activeId}
                  isBookmarked={bookmarkedKeys?.has(entryKey(entry)) ?? false}
                  onActivate={setActiveId}
                  onToggleBookmark={onToggleBookmark}
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
          aria-valuenow={indexOfEntry(entries[Math.min(entries.length - 1, startIndex)]?.id ?? 0) || 0}
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
