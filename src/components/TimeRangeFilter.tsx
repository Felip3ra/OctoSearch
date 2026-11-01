import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';

interface TimeRangeFilterProps {
  timeFrom?: number;
  timeTo?: number;
  /** Most recent record time; the quick ranges count back from it, so they also work on old logs. */
  latestTime?: number;
  disabled?: boolean;
  buttonClassName: string;
  activeClassName: string;
  neutralClassName: string;
  onChange: (timeFrom: number | undefined, timeTo: number | undefined) => void;
}

const QUICK_RANGES: { label: string; minutes: number }[] = [
  { label: '15 min', minutes: 15 },
  { label: '1 hora', minutes: 60 },
  { label: '6 horas', minutes: 6 * 60 },
  { label: '24 horas', minutes: 24 * 60 },
  { label: '7 dias', minutes: 7 * 24 * 60 },
];

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInputValue(time: number | undefined): string {
  if (time === undefined || !Number.isFinite(time)) return '';
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function fromLocalInputValue(value: string): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function quickRangeStart(latestTime: number | undefined, minutes: number): number {
  return (latestTime ?? Date.now()) - minutes * 60 * 1000;
}

export function formatRangeTime(time: number): string {
  return new Date(time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function describeTimeRange(timeFrom?: number, timeTo?: number): string {
  if (timeFrom !== undefined && timeTo !== undefined) return `${formatRangeTime(timeFrom)} – ${formatRangeTime(timeTo)}`;
  if (timeFrom !== undefined) return `a partir de ${formatRangeTime(timeFrom)}`;
  if (timeTo !== undefined) return `até ${formatRangeTime(timeTo)}`;
  return '';
}

const inputClass =
  'h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-mono text-xs text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:[color-scheme:dark]';

export function TimeRangeFilter({
  timeFrom,
  timeTo,
  latestTime,
  disabled,
  buttonClassName,
  activeClassName,
  neutralClassName,
  onChange,
}: Readonly<TimeRangeFilterProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isActive = timeFrom !== undefined || timeTo !== undefined;

  useEffect(() => {
    if (!isOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const applyQuickRange = (minutes: number) => onChange(quickRangeStart(latestTime, minutes), undefined);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        ref={buttonRef}
        onClick={() => {
          // Fixed positioning: the toolbar scrolls horizontally and would clip an absolute popover.
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) setPosition({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
          setIsOpen((current) => !current);
        }}
        disabled={disabled}
        aria-expanded={isOpen}
        title="Filtrar os registros por data e hora"
        className={`${buttonClassName} ${isActive ? activeClassName : neutralClassName}`}
      >
        <CalendarClock className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Período</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Filtrar por período"
          style={{ top: position.top, right: position.right }}
          className="fixed z-40 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="mb-1.5 font-semibold text-slate-700 dark:text-slate-200">Últimos do log</p>
          <div className="mb-3 flex flex-wrap gap-1">
            {QUICK_RANGES.map((range) => (
              <button
                key={range.minutes}
                type="button"
                onClick={() => applyQuickRange(range.minutes)}
                className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {range.label}
              </button>
            ))}
          </div>

          <label className="mb-1 block font-medium text-slate-600 dark:text-slate-300" htmlFor="time-range-from">
            De
          </label>
          <input
            id="time-range-from"
            type="datetime-local"
            step={1}
            value={toLocalInputValue(timeFrom)}
            onChange={(event) => onChange(fromLocalInputValue(event.target.value), timeTo)}
            className={inputClass}
          />
          <label className="mb-1 mt-2 block font-medium text-slate-600 dark:text-slate-300" htmlFor="time-range-to">
            Até
          </label>
          <input
            id="time-range-to"
            type="datetime-local"
            step={1}
            value={toLocalInputValue(timeTo)}
            onChange={(event) => onChange(timeFrom, fromLocalInputValue(event.target.value))}
            className={inputClass}
          />

          <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Registros sem data ficam ocultos enquanto o período estiver ativo. Os atalhos contam a partir do registro mais recente.
          </p>

          {isActive && (
            <button
              type="button"
              onClick={() => onChange(undefined, undefined)}
              className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X className="h-3 w-3" /> Limpar período
            </button>
          )}
        </div>
      )}
    </div>
  );
}
