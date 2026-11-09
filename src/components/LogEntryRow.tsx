import React, { useEffect, useRef, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { LogEntry, EntryLogLevel, HighlightRule, SearchPattern } from '../types';
import { createAnyPatternMatcher, splitTextWithHighlights } from '../services/logSearch';
import { entryDisplayTime, entryMessage, entryStackTrace, entryTimestamp, hasStackTrace } from '../services/logEntry';
import { highlightColorWithAlpha, normalizeHighlightColor } from '../utils/highlightColor';
import { ROW_BORDER, ROW_HEIGHT } from './rowMetrics';
import { ChevronDown, ChevronRight, Copy, Check, PanelRight, Pin } from 'lucide-react';

interface LogEntryRowProps {
  entry: LogEntry;
  searchTerms: SearchPattern[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  highlightRule?: HighlightRule;
  wordWrap?: boolean;
  sourceColor?: string;
  onHeightChange?: (id: number, height: number) => void;
  /** The row the keyboard shortcuts act on (last clicked or navigated to). */
  isActive?: boolean;
  isBookmarked?: boolean;
  onActivate?: (id: number) => void;
  onToggleBookmark?: (entry: LogEntry) => void;
  /** Opens the details panel (double click, Enter or the context menu). */
  onOpenDetails?: (entry: LogEntry) => void;
  /** Shorter rows: less padding and line height. Must match the row height used by the list. */
  compact?: boolean;
}

const LEVEL_STYLES: Record<EntryLogLevel, { badge: string; text: string; rowBg: string }> = {
  INF: {
    badge: 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300 dark:border-sky-400/20',
    text: 'text-slate-800 dark:text-slate-200',
    rowBg: 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
  },
  WRN: {
    badge: 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-300 dark:border-amber-400/25',
    text: 'text-amber-950 dark:text-amber-100',
    rowBg: 'bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-500/[0.06] dark:hover:bg-amber-500/10',
  },
  ERR: {
    badge: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300 dark:border-rose-400/25',
    text: 'text-rose-950 dark:text-rose-100',
    rowBg: 'bg-rose-50/60 hover:bg-rose-50 dark:bg-rose-500/[0.07] dark:hover:bg-rose-500/[0.12]',
  },
  DBG: {
    badge: 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400 dark:border-slate-500/25',
    text: 'text-slate-500 dark:text-slate-400',
    rowBg: 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
  },
  OTHER: {
    badge: 'bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300 dark:border-violet-400/20',
    text: 'text-slate-700 dark:text-slate-300',
    rowBg: 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
  },
};

const SEVERE_LEVEL_LABELS: Record<string, string> = {
  FTL: 'FTL', FATAL: 'FTL', CRT: 'CRT', CRIT: 'CRT', CRITICAL: 'CRT', ALERT: 'CRT', EMERGENCY: 'CRT',
};

/** Short, fixed-width badge text; the original level stays available in the tooltip. */
function getLevelLabel(entry: LogEntry): string {
  if (SEVERE_LEVEL_LABELS[entry.rawLevel]) return SEVERE_LEVEL_LABELS[entry.rawLevel];
  return entry.level === 'OTHER' ? '—' : entry.level;
}

function renderHighlightedText(text: string, searchTerms: SearchPattern[]) {
  if (searchTerms.length === 0) {
    return <span>{text}</span>;
  }
  const segments = splitTextWithHighlights(text, searchTerms);
  let segmentOffset = 0;
  return (
    <>
      {segments.map((segment) => {
        const segmentKey = `${segmentOffset}-${segment.isMatch ? 'match' : 'text'}`;
        segmentOffset += segment.text.length;
        return segment.isMatch ? (
          <mark
            key={segmentKey}
            className="bg-yellow-300 dark:bg-yellow-500/80 text-black px-0.5 rounded-xs font-semibold"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={segmentKey}>{segment.text}</span>
        );
      })}
    </>
  );
}

function getRowAppearanceClass(
  highlightColor: string | null,
  searchMatches: boolean,
  defaultRowClass: string
): string {
  if (highlightColor) return 'font-medium text-slate-950 dark:text-slate-50';
  if (searchMatches) {
    return 'border-yellow-300 bg-yellow-100/80 hover:bg-yellow-200/80 dark:border-yellow-900 dark:bg-yellow-950/45 dark:hover:bg-yellow-950/65';
  }
  return `border-slate-100 dark:border-slate-800/80 ${defaultRowClass}`;
}

function stackContainsSearch(entry: LogEntry, searchTerms: SearchPattern[]): boolean {
  if (searchTerms.length === 0 || !hasStackTrace(entry)) return false;
  const matches = createAnyPatternMatcher(searchTerms);
  return entryStackTrace(entry).some(matches);
}

function entryContainsAnySearchTerm(entry: LogEntry, searchTerms: SearchPattern[]): boolean {
  if (searchTerms.length === 0) return false;
  return createAnyPatternMatcher(searchTerms)(entry.rawText);
}

function getHighlightStyle(highlightColor: string | null): React.CSSProperties | undefined {
  if (!highlightColor) return undefined;
  return {
    backgroundColor: highlightColorWithAlpha(highlightColor, 0.2),
    borderColor: highlightColor,
    boxShadow: `inset 4px 0 0 ${highlightColor}`,
  };
}

interface StackTraceDetailsProps {
  entry: LogEntry;
  searchTerms: SearchPattern[];
  wordWrap: boolean;
}

function StackTraceDetails({
  entry,
  searchTerms,
  wordWrap,
}: Readonly<StackTraceDetailsProps>) {
  const stackTrace = entryStackTrace(entry);
  const stackLines = stackTrace.map((text, index) => ({
    text,
    lineNumber: index,
  }));

  return (
    <div className={`pl-24 pr-4 pb-2 pt-0.5 min-w-full ${wordWrap ? 'w-full' : 'w-max'}`}>
      <div className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded p-2 text-rose-950 dark:text-rose-200 text-[11px] leading-snug">
        <div className="text-[10px] font-sans font-semibold text-rose-700 dark:text-rose-400 mb-1 select-none flex items-center justify-between">
          <span>CONTEXTO DA EXCEÇÃO / STACK TRACE ({stackTrace.length} LINHAS):</span>
          {entry.endLine > entry.startLine && (
            <span className="text-[9px] font-normal text-slate-500">Linhas {entry.endLine - stackTrace.length + 1} a {entry.endLine}</span>
          )}
        </div>
        <div className={`font-mono ${wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
          {stackLines.map(({ text, lineNumber }) => (
            <div key={`line-${lineNumber}`} className="hover:bg-rose-100/50 dark:hover:bg-rose-900/20 py-0.5 px-1 rounded">
              {renderHighlightedText(text, searchTerms)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface EntryContextMenuProps {
  entry: LogEntry;
  position: { x: number; y: number };
  isExpanded: boolean;
  isBookmarked: boolean;
  onToggle: () => void;
  onToggleBookmark?: () => void;
  onOpenDetails?: () => void;
  onClose: () => void;
}

function EntryContextMenu({
  entry,
  position,
  isExpanded,
  isBookmarked,
  onToggle,
  onToggleBookmark,
  onOpenDetails,
  onClose,
}: Readonly<EntryContextMenuProps>) {
  const copyAndClose = (text: string) => {
    void navigator.clipboard.writeText(text);
    onClose();
  };

  return (
    <div
      role="menu"
      tabIndex={-1}
      className="fixed z-50 w-52 overflow-hidden rounded-md border border-slate-200 bg-white py-1 font-sans text-xs text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      style={{ left: position.x, top: position.y }}
    >
      <div className="truncate border-b border-slate-100 px-3 py-1.5 font-mono text-[10px] text-slate-400 dark:border-slate-800">
        Linha {entry.startLine}{entry.sourceFile ? ` · ${entry.sourceFile}` : ''}
      </div>
      {onOpenDetails && (
        <button type="button" role="menuitem" onClick={() => { onOpenDetails(); onClose(); }} className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left font-medium hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800">
          <PanelRight className="h-3.5 w-3.5" /> Ver detalhes <kbd className="ml-auto font-mono text-[10px] text-slate-400">Enter</kbd>
        </button>
      )}
      <button type="button" role="menuitem" onClick={() => copyAndClose(entry.rawText)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
        <Copy className="h-3.5 w-3.5" /> Copiar registro completo
      </button>
      <button type="button" role="menuitem" onClick={() => copyAndClose(entryMessage(entry))} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
        <Copy className="h-3.5 w-3.5" /> Copiar mensagem
      </button>
      <button type="button" role="menuitem" onClick={() => copyAndClose(entryTimestamp(entry))} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
        <Copy className="h-3.5 w-3.5" /> Copiar data e hora
      </button>
      {onToggleBookmark && (
        <button type="button" role="menuitem" onClick={() => { onToggleBookmark(); onClose(); }} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800">
          <Pin className="h-3.5 w-3.5" /> {isBookmarked ? 'Desmarcar registro' : 'Marcar registro'} <kbd className="ml-auto font-mono text-[10px] text-slate-400">Ctrl+B</kbd>
        </button>
      )}
      {hasStackTrace(entry) && (
        <button type="button" role="menuitem" onClick={() => { onToggle(); onClose(); }} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {isExpanded ? 'Recolher exceção' : 'Expandir exceção'}
        </button>
      )}
    </div>
  );
}

interface PrimaryLogLineProps {
  entry: LogEntry;
  searchTerms: SearchPattern[];
  isExpanded: boolean;
  wordWrap: boolean;
  highlightColor: string | null;
  styles: (typeof LEVEL_STYLES)[EntryLogLevel];
  sourceColor?: string;
  copied: boolean;
  isBookmarked: boolean;
  compact: boolean;
  onToggle: (event?: React.MouseEvent) => void;
  onCopy: (event: React.MouseEvent) => void;
  onToggleBookmark?: (event: React.MouseEvent) => void;
}

function PrimaryLogLine({
  entry,
  searchTerms,
  isExpanded,
  wordWrap,
  highlightColor,
  styles,
  sourceColor,
  copied,
  isBookmarked,
  compact,
  onToggle,
  onCopy,
  onToggleBookmark,
}: Readonly<PrimaryLogLineProps>) {
  const widthClass = wordWrap ? 'w-full' : 'w-max';
  const timestamp = entryDisplayTime(entry);
  const originalTimestamp = entryTimestamp(entry);
  const lineNumberClass = highlightColor ? '' : 'text-slate-400 dark:text-slate-500';
  const timestampClass = highlightColor
    ? 'text-slate-700 dark:text-slate-200'
    : 'text-slate-500 dark:text-slate-400';
  const messageLayoutClass = wordWrap
    ? 'min-w-0 flex-1 whitespace-pre-wrap break-words'
    : 'flex-none whitespace-pre';
  const messageColorClass = highlightColor
    ? 'font-medium text-slate-950 dark:text-slate-50'
    : styles.text;

  return (
    <div
      className={`flex items-start px-2 gap-2 select-text min-w-full ${compact ? 'py-0.5' : 'py-1.5'} ${wordWrap ? '' : 'overflow-hidden'} ${widthClass}`}
      // Without word wrap the height is fixed and must be the one the virtual list uses (rowMetrics).
      style={wordWrap ? undefined : { height: (compact ? ROW_HEIGHT.compact : ROW_HEIGHT.normal) - ROW_BORDER }}
    >
      <span
        className={`flex w-10 shrink-0 items-center justify-end gap-1 text-right select-none pr-1 sm:w-14 ${lineNumberClass}`}
        style={highlightColor ? { color: highlightColor } : undefined}
      >
        {isBookmarked && <Pin className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" aria-label="Registro marcado" />}
        {entry.startLine}
      </span>

      <div className="w-5 shrink-0 flex items-center justify-center pt-0.5">
        {hasStackTrace(entry) ? (
          <button
            type="button"
            onClick={onToggle}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            title={isExpanded ? 'Recolher detalhes da exceção' : 'Expandir detalhes da exceção'}
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
            )}
          </button>
        ) : (
          <span className="w-3.5 h-3.5" />
        )}
      </div>

      {entry.sourceFile && (
        <span
          className="flex w-24 shrink-0 select-none items-center gap-1.5 truncate rounded border sm:w-36 border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
          style={sourceColor ? { borderLeftColor: sourceColor, borderLeftWidth: 3 } : undefined}
          title={entry.sourceFile}
        >
          <span className="truncate">{entry.sourceFile}</span>
        </span>
      )}

      <span
        className={`w-[5.5rem] shrink-0 select-none truncate whitespace-nowrap text-[11px] tabular-nums sm:w-40 ${timestampClass}`}
        title={originalTimestamp && originalTimestamp !== timestamp ? `No arquivo: ${originalTimestamp}` : timestamp}
      >
        <span className="hidden sm:inline">{renderHighlightedText(timestamp, searchTerms)}</span>
        {/* Phones: only the time of day ("2026-10-08 13:43:27.100" → "13:43:27.100"). */}
        <span className="sm:hidden">{entry.time !== undefined ? timestamp.slice(11) : timestamp}</span>
      </span>

      <span className={`shrink-0 w-11 text-center py-0.5 rounded text-[10px] font-bold border select-none ${styles.badge}`} title={entry.rawLevel || 'Sem nível'}>
        {getLevelLabel(entry)}
      </span>

      <div className={`${messageLayoutClass} ${compact ? 'leading-snug' : 'leading-relaxed'} pr-2 ${messageColorClass}`}>
        {renderHighlightedText(entryMessage(entry), searchTerms)}
        {hasStackTrace(entry) && !isExpanded && (
          <button
            type="button"
            onClick={onToggle}
            className="ml-2 inline-flex items-center gap-1 text-[10px] text-rose-600 dark:text-rose-400 underline hover:opacity-80 font-sans cursor-pointer select-none font-semibold"
          >
            [+{entry.stackLines} linhas de exceção]
          </button>
        )}
      </div>

      {onToggleBookmark && (
        <button
          type="button"
          onClick={onToggleBookmark}
          title={isBookmarked ? 'Desmarcar registro (Ctrl+B)' : 'Marcar registro (Ctrl+B); F2 vai para o próximo marcado'}
          className={`shrink-0 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-opacity ${isBookmarked ? 'text-amber-500 opacity-100' : 'text-slate-500 opacity-0 group-hover:opacity-100'}`}
        >
          <Pin className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400' : ''}`} />
        </button>
      )}

      <button
        type="button"
        onClick={onCopy}
        title="Copiar registro completo com stack trace"
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

export const LogEntryRow = memo(function LogEntryRow({
  entry,
  searchTerms,
  isExpanded: controlledExpanded,
  onToggleExpand,
  highlightRule,
  wordWrap = false,
  sourceColor,
  onHeightChange,
  isActive = false,
  isBookmarked = false,
  onActivate,
  onToggleBookmark,
  onOpenDetails,
  compact = false,
}: LogEntryRowProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const searchInStack = stackContainsSearch(entry, searchTerms);

  const isExpanded = controlledExpanded ?? (internalExpanded || searchInStack);
  const styles = LEVEL_STYLES[entry.level];
  const highlightColor = normalizeHighlightColor(highlightRule?.color);
  const highlightStyle = getHighlightStyle(highlightColor);
  const searchMatches = entryContainsAnySearchTerm(entry, searchTerms);
  const rowAppearanceClass = getRowAppearanceClass(highlightColor, searchMatches, styles.rowBg);

  useEffect(() => {
    const element = rowRef.current;
    if (!element || !onHeightChange) return;

    const reportHeight = () => onHeightChange(entry.id, element.getBoundingClientRect().height);
    reportHeight();
    const observer = new ResizeObserver(reportHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [entry.id, onHeightChange, wordWrap, isExpanded]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  const handleToggle = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!hasStackTrace(entry)) return;
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(entry.rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      ref={rowRef}
      id={`log-entry-${entry.id}`}
      onContextMenu={(event) => {
        event.preventDefault();
        setContextMenu({
          x: Math.min(event.clientX, window.innerWidth - 220),
          y: Math.min(event.clientY, window.innerHeight - 230),
        });
      }}
      onClick={() => onActivate?.(entry.id)}
      onDoubleClick={() => onOpenDetails?.(entry)}
      title={highlightRule ? `Marcador: contém “${highlightRule.text}”` : undefined}
      style={highlightStyle}
      className={`border-b text-xs font-mono transition-colors group ${rowAppearanceClass} ${isActive ? 'outline outline-2 -outline-offset-2 outline-sky-500/70' : ''}`}
    >
      <PrimaryLogLine
        entry={entry}
        searchTerms={searchTerms}
        isExpanded={isExpanded}
        wordWrap={wordWrap}
        highlightColor={highlightColor}
        styles={styles}
        sourceColor={sourceColor}
        copied={copied}
        isBookmarked={isBookmarked}
        compact={compact}
        onToggle={handleToggle}
        onCopy={handleCopy}
        onToggleBookmark={onToggleBookmark ? (event) => { event.stopPropagation(); onToggleBookmark(entry); } : undefined}
      />

      {hasStackTrace(entry) && isExpanded && (
        <StackTraceDetails entry={entry} searchTerms={searchTerms} wordWrap={wordWrap} />
      )}

      {/* Rendered in <body>: the virtual list moves rows with a transform, and position: fixed
          inside a transformed element is relative to it, not to the window. */}
      {contextMenu && createPortal(
        <EntryContextMenu
          entry={entry}
          position={contextMenu}
          isExpanded={isExpanded}
          isBookmarked={isBookmarked}
          onToggle={handleToggle}
          onToggleBookmark={onToggleBookmark ? () => onToggleBookmark(entry) : undefined}
          onOpenDetails={onOpenDetails ? () => onOpenDetails(entry) : undefined}
          onClose={() => setContextMenu(null)}
        />,
        document.body
      )}
    </div>
  );
});
