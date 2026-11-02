import { useMemo, useState } from 'react';
import { ListOrdered, Search, X } from 'lucide-react';
import { EntryLogLevel, LogEntry } from '../types';
import { groupByMessage } from '../services/errorGroups';
import { entryTimestamp } from '../services/logEntry';

interface ErrorGroupsPanelProps {
  isOpen: boolean;
  /** The records currently shown (filters and period applied). */
  entries: LogEntry[];
  /** Adds a regex filter that keeps only the records of a group. */
  onFilterGroup: (pattern: string, template: string) => void;
  onShowEntry: (entry: LogEntry) => void;
  onClose: () => void;
}

const ERRORS_ONLY: ReadonlySet<EntryLogLevel> = new Set(['ERR']);
const ERRORS_AND_WARNINGS: ReadonlySet<EntryLogLevel> = new Set(['ERR', 'WRN']);

/** "Top errors": records grouped by message, ignoring the parts that change (ids, numbers, GUIDs...). */
export function ErrorGroupsPanel({ isOpen, entries, onFilterGroup, onShowEntry, onClose }: Readonly<ErrorGroupsPanelProps>) {
  const [withWarnings, setWithWarnings] = useState(false);
  const groups = useMemo(
    () => (isOpen ? groupByMessage(entries, withWarnings ? ERRORS_AND_WARNINGS : ERRORS_ONLY) : []),
    [isOpen, entries, withWarnings]
  );
  if (!isOpen) return null;
  const total = groups.reduce((sum, group) => sum + group.count, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]">
      <button type="button" aria-label="Fechar top erros" className="absolute inset-0 cursor-default" onClick={onClose} />
      <dialog
        open
        aria-modal="true"
        aria-labelledby="error-groups-title"
        className="relative z-10 m-0 flex h-full w-full max-w-xl flex-col border-l border-slate-300 bg-white p-0 text-inherit shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-rose-500" />
            <h2 id="error-groups-title" className="text-sm font-semibold">Top erros</h2>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={withWarnings} onChange={(event) => setWithWarnings(event.target.checked)} className="accent-sky-600" />
              Incluir avisos (WRN)
            </label>
            <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar top erros">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <p className="border-b border-slate-100 px-4 py-2 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Mensagens iguais a menos de números, IDs, GUIDs, textos entre aspas e URLs ficam no mesmo grupo. A contagem
          considera os registros visíveis (filtros e período aplicados).
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.length === 0 && (
            <p className="px-4 py-10 text-center text-xs text-slate-500">Nenhum {withWarnings ? 'erro ou aviso' : 'erro'} nos registros visíveis.</p>
          )}
          <ol className="divide-y divide-slate-100 dark:divide-slate-800">
            {groups.map((group, index) => (
              <li key={group.template} className="px-4 py-2.5">
                <div className="flex items-start gap-3">
                  <span className="w-5 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-slate-400">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-mono text-xs text-slate-800 dark:text-slate-100">{group.template}</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <strong className="text-slate-700 dark:text-slate-200">{group.count.toLocaleString('pt-BR')}×</strong>
                      {' '}({Math.round((group.count / total) * 100)}%) · última: {entryTimestamp(group.last) || `linha ${group.last.startLine}`}
                      {group.last.sourceFile ? ` · ${group.last.sourceFile}` : ''}
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onFilterGroup(group.pattern, group.template)}
                        className="flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                      >
                        <Search className="h-3 w-3" /> Filtrar este grupo
                      </button>
                      <button
                        type="button"
                        onClick={() => onShowEntry(group.last)}
                        className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                      >
                        Ir para a última
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </dialog>
    </div>
  );
}
