import { LogFileItem, LogLevel, SearchFilter } from '../types';
import { FileText, CheckCircle2, Loader2, AlertCircle, ArrowDown } from 'lucide-react';

interface StatusBarProps {
  currentFile: LogFileItem | null;
  totalLines: number;
  totalEntries: number;
  filteredCount: number;
  searchFilters: SearchFilter[];
  levelFilter: LogLevel;
  lineLimit?: string;
  customLineLimit?: number;
  lineLimitDirection?: 'tail' | 'head';
  isLoading: boolean;
  loadingProgress?: number;
  errorMessage?: string | null;
  isWatching?: boolean;
  autoScroll?: boolean;
  lastLiveUpdate?: Date | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusIndicator({
  errorMessage,
  isLoading,
  loadingProgress,
}: Readonly<Pick<StatusBarProps, 'errorMessage' | 'isLoading' | 'loadingProgress'>>) {
  if (isLoading) {
    return (
      <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Processando{loadingProgress === undefined ? '' : ` ${loadingProgress}%`}</span>
      </span>
    );
  }

  if (errorMessage) {
    return (
      <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400" title={errorMessage}>
        <AlertCircle className="h-3 w-3" />
        <span>Erro</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" />
      <span>Pronto</span>
    </span>
  );
}

function Metric({ label, value, highlight = false }: Readonly<{ label: string; value: number; highlight?: boolean }>) {
  return (
    <span className="shrink-0">
      {label}{' '}
      <strong className={`font-semibold tabular-nums ${highlight ? 'text-sky-600 dark:text-sky-400' : 'text-slate-700 dark:text-slate-200'}`}>
        {value.toLocaleString('pt-BR')}
      </strong>
    </span>
  );
}

export function StatusBar({
  currentFile,
  totalLines,
  totalEntries,
  filteredCount,
  searchFilters,
  levelFilter,
  lineLimit = 'ALL',
  isLoading,
  loadingProgress,
  errorMessage,
  isWatching = false,
  autoScroll = false,
  lastLiveUpdate,
}: Readonly<StatusBarProps>) {
  const isFiltered = searchFilters.length > 0 || levelFilter !== 'ALL' || lineLimit !== 'ALL';

  return (
    <footer className="flex h-7 shrink-0 select-none items-center justify-between gap-3 overflow-x-auto overscroll-x-contain border-t border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <div className="flex min-w-max items-center gap-4 sm:min-w-0 sm:flex-1">
        <span className="flex min-w-0 max-w-[320px] items-center gap-1.5">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate font-medium text-slate-700 dark:text-slate-200" title={currentFile?.path}>
            {currentFile ? currentFile.name : 'Nenhum arquivo'}
          </span>
          {currentFile && <span className="shrink-0 tabular-nums">· {formatSize(currentFile.size)}</span>}
        </span>
        <span className="hidden sm:inline"><Metric label="Linhas" value={totalLines} /></span>
        <Metric label="Registros" value={totalEntries} />
        <Metric label="Exibidos" value={filteredCount} highlight={isFiltered} />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {isWatching && (
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Tempo real
            {lastLiveUpdate && <span className="tabular-nums text-slate-400">· {lastLiveUpdate.toLocaleTimeString('pt-BR')}</span>}
          </span>
        )}
        {autoScroll && (
          <span className="hidden items-center gap-1 sm:flex">
            <ArrowDown className="h-3 w-3" /> Auto-rolar
          </span>
        )}
        <StatusIndicator errorMessage={errorMessage} isLoading={isLoading} loadingProgress={loadingProgress} />
      </div>
    </footer>
  );
}
