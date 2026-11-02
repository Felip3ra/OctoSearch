import { LogLevel } from '../types';

export const toolbarButtonClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40';
export const neutralButtonClass =
  'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100';
export const activeButtonClass = 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300';

export const LEVEL_OPTIONS: { value: LogLevel; label: string; dot?: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ERR', label: 'ERR', dot: 'bg-rose-500' },
  { value: 'WRN', label: 'WRN', dot: 'bg-amber-500' },
  { value: 'INF', label: 'INF', dot: 'bg-sky-500' },
  { value: 'DBG', label: 'DBG', dot: 'bg-slate-400' },
  { value: 'OTHER', label: 'Outros', dot: 'bg-violet-400' },
];
