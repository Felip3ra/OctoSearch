import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface Command {
  id: string;
  label: string;
  group: string;
  icon?: LucideIcon;
  /** Extra words that also find the command (synonyms, the English name…). */
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  commands: Command[];
  onClose: () => void;
}

const MAX_RESULTS = 60;

/** Lowercase without accents, so "periodo" finds "Período". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Every typed word must appear in the label, group or keywords; label matches rank first. */
export function searchCommands(commands: Command[], query: string): Command[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  return commands
    .map((command) => {
      const label = normalize(command.label);
      const haystack = `${label} ${normalize(command.group)} ${normalize(command.keywords ?? '')}`;
      if (!words.every((word) => haystack.includes(word))) return null;
      const score = words.reduce((total, word) => total + (label.startsWith(word) ? 3 : label.includes(word) ? 2 : 0), 0);
      return { command, score };
    })
    .filter((item): item is { command: Command; score: number } => item !== null)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.command);
}

/**
 * Ctrl+K: finds and runs any action by name, plus tabs, saved folders and saved filters.
 * Arrow keys move, Enter runs, Esc closes.
 */
export function CommandPalette({ isOpen, commands, onClose }: Readonly<CommandPaletteProps>) {
  if (!isOpen) return null;
  return <PaletteDialog commands={commands} onClose={onClose} />;
}

function PaletteDialog({ commands, onClose }: Readonly<Omit<CommandPaletteProps, 'isOpen'>>) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchCommands(commands, query).slice(0, MAX_RESULTS), [commands, query]);
  const current = Math.min(selected, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 px-4 pt-[12vh] backdrop-blur-sm">
      <button type="button" aria-label="Fechar paleta de comandos" className="absolute inset-0 cursor-default" onClick={onClose} />
      <dialog
        open
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="relative z-10 m-0 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white p-0 text-inherit shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 dark:border-slate-700">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected(Math.min(results.length - 1, current + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected(Math.max(0, current - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                run(results[current]);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Digite um comando, uma pasta ou um filtro salvo…"
            aria-label="Buscar comando"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[current] ? `command-${results[current].id}` : undefined}
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="shrink-0 rounded border border-slate-300 px-1.5 font-mono text-[10px] text-slate-400 dark:border-slate-600">Esc</kbd>
        </div>
        <div ref={listRef} id="command-palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
          {results.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-500">Nenhum comando encontrado.</p>}
          {results.map((command, index) => {
            // Group titles only when browsing (empty search), where commands come in group order.
            const showGroup = query.trim() === '' && (index === 0 || results[index - 1].group !== command.group);
            const Icon = command.icon;
            return (
              <div key={command.id}>
                {showGroup && <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{command.group}</p>}
                <button
                  type="button"
                  id={`command-${command.id}`}
                  role="option"
                  aria-selected={index === current}
                  data-index={index}
                  onMouseMove={() => setSelected(index)}
                  onClick={() => run(command)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs ${
                    index === current ? 'bg-sky-50 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : <span className="w-3.5" />}
                  <span className="flex-1 truncate">{command.label}</span>
                  {query.trim() !== '' && <span className="shrink-0 text-[10px] text-slate-400">{command.group}</span>}
                  {command.shortcut && <kbd className="shrink-0 font-mono text-[10px] text-slate-400">{command.shortcut}</kbd>}
                  {index === current && <CornerDownLeft className="h-3 w-3 shrink-0 text-slate-400" />}
                </button>
              </div>
            );
          })}
        </div>
      </dialog>
    </div>
  );
}
