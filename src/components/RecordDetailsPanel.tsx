import { useMemo, useState } from 'react';
import { Check, Copy, Minus, Plus, X } from 'lucide-react';
import { LogEntry, SearchMode } from '../types';
import { entryDisplayTime, entryMessage, entryStackTrace, entryTimestamp } from '../services/logEntry';
import { entryFieldList } from '../services/logFields';

interface RecordDetailsPanelProps {
  entry: LogEntry | null;
  sourceColor?: string;
  /** Adds a search term (used by the field buttons: `$campo = valor`). */
  onAddFilter: (text: string, mode: SearchMode) => void;
  onClose: () => void;
}

const MAX_FIELDS = 200;

const LEVEL_BADGES: Record<LogEntry['level'], string> = {
  ERR: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300',
  WRN: 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-300',
  INF: 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300',
  DBG: 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400',
  OTHER: 'bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300',
};

/** `$campo = valor`, quoting values with spaces so the field filter reads them whole. */
function fieldFilterText(name: string, value: string): string {
  const quoted = /[\s"]/.test(value) && !value.includes('"') ? `"${value}"` : value;
  return `$${name} = ${quoted}`;
}

function CopyButton({ text, label }: Readonly<{ text: string; label: string }>) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title={label}
      aria-label={label}
      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Section({ title, action, children }: Readonly<{ title: string; action?: React.ReactNode; children: React.ReactNode }>) {
  return (
    <section className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Everything about the selected record in one place: date (as shown and as written), message,
 * fields with buttons to filter by them, stack trace and the original text.
 * Opens with Enter, a double click or "Ver detalhes" in the context menu.
 */
export function RecordDetailsPanel({ entry, sourceColor, onAddFilter, onClose }: Readonly<RecordDetailsPanelProps>) {
  const fields = useMemo(() => (entry ? entryFieldList(entry).slice(0, MAX_FIELDS) : []), [entry]);

  return (
    <aside
      aria-label="Detalhes do registro"
      className="absolute inset-0 z-20 flex flex-col overflow-hidden border-l border-slate-200 bg-white text-xs md:static md:w-[400px] md:shrink-0 dark:border-slate-800 dark:bg-slate-900"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        <h2 className="text-sm font-semibold">Detalhes do registro</h2>
        <button type="button" onClick={onClose} title="Fechar (Esc)" aria-label="Fechar detalhes" className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </header>

      {!entry ? (
        <p className="px-4 py-10 text-center text-slate-500">Clique num registro para ver os detalhes aqui.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto select-text">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${LEVEL_BADGES[entry.level]}`} title={entry.rawLevel || 'Sem nível'}>
              {entry.rawLevel || entry.level}
            </span>
            {entry.sourceFile && (
              <span
                className="max-w-56 truncate rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium dark:border-slate-700 dark:bg-slate-800/70"
                style={sourceColor ? { borderLeftColor: sourceColor, borderLeftWidth: 3 } : undefined}
                title={entry.sourceFile}
              >
                {entry.sourceFile}
              </span>
            )}
            <span className="text-slate-500">
              {entry.endLine > entry.startLine ? `Linhas ${entry.startLine}–${entry.endLine}` : `Linha ${entry.startLine}`}
            </span>
          </div>

          <Section title="Data e hora">
            <p className="font-mono tabular-nums">{entryDisplayTime(entry) || '—'}</p>
            {entry.time !== undefined && entryTimestamp(entry) && entryTimestamp(entry) !== entryDisplayTime(entry) && (
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">No arquivo: {entryTimestamp(entry)}</p>
            )}
          </Section>

          <Section title="Mensagem" action={<CopyButton text={entryMessage(entry)} label="Copiar mensagem" />}>
            <p className="whitespace-pre-wrap break-words font-mono leading-relaxed">{entryMessage(entry) || '—'}</p>
          </Section>

          {fields.length > 0 && (
            <Section title={`Campos (${fields.length})`}>
              <table className="w-full table-fixed border-collapse font-mono text-[11px]">
                <tbody>
                  {fields.map(([name, value]) => (
                    <tr key={name} className="group border-t border-slate-100 first:border-t-0 dark:border-slate-800">
                      <td className="w-2/5 truncate py-1 pr-2 align-top text-slate-500" title={name}>{name}</td>
                      <td className="break-words py-1 align-top">{value}</td>
                      <td className="w-14 py-0.5 text-right align-top">
                        <span className="inline-flex opacity-40 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => onAddFilter(fieldFilterText(name, value), 'include')}
                            title={`Mostrar só registros com ${name} = ${value}`}
                            className="rounded p-0.5 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddFilter(fieldFilterText(name, value), 'exclude')}
                            title={`Esconder registros com ${name} = ${value}`}
                            className="rounded p-0.5 text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {entry.stackLines > 0 && (
            <Section title={`Stack trace (${entry.stackLines} linhas)`} action={<CopyButton text={entryStackTrace(entry).join('\n')} label="Copiar stack trace" />}>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-rose-900 dark:text-rose-200">{entryStackTrace(entry).join('\n')}</pre>
            </Section>
          )}

          <Section title="Registro original" action={<CopyButton text={entry.rawText} label="Copiar registro completo" />}>
            <pre className="whitespace-pre-wrap break-words rounded bg-slate-50 p-2 font-mono text-[11px] leading-snug text-slate-700 dark:bg-slate-950 dark:text-slate-300">{entry.rawText}</pre>
          </Section>
        </div>
      )}
    </aside>
  );
}
