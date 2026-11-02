import React from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { HighlightRule, SearchFilter } from '../types';
import { TabFilters } from '../hooks/useTabFilters';
import { describeTimeRange } from './TimeRangeFilter';
import { LEVEL_OPTIONS } from './toolbarStyles';

interface FilterChipsProps {
  filters: TabFilters;
  highlightRules: HighlightRule[];
}

function Connector({ operator, onToggle }: Readonly<{ operator: 'and' | 'or'; onToggle: () => void }>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={
        operator === 'and'
          ? 'E: o registro precisa conter os dois termos. Clique para trocar para OU'
          : 'OU: basta o registro conter um dos lados. Clique para trocar para E'
      }
      className={`shrink-0 cursor-pointer rounded border px-1.5 py-px text-[10px] font-bold uppercase tracking-wide transition-colors ${
        operator === 'and'
          ? 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300'
          : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
      }`}
    >
      {operator === 'and' ? 'e' : 'ou'}
    </button>
  );
}

function TermChip({ filter, filters }: Readonly<{ filter: SearchFilter; filters: TabFilters }>) {
  const excluded = filter.mode === 'exclude';
  return (
    <span
      className={`flex shrink-0 items-center overflow-hidden rounded-full border font-medium ${
        excluded
          ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
      }`}
    >
      <button
        type="button"
        onClick={() => filters.toggleSearchFilterMode(filter.id)}
        title={excluded ? 'Clique para incluir este termo em vez de excluir' : 'Clique para excluir este termo em vez de incluir'}
        className={`flex cursor-pointer items-center gap-1 py-0.5 pl-2.5 pr-1 transition-colors ${
          excluded ? 'hover:bg-rose-100 dark:hover:bg-rose-900/40' : 'hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
        }`}
      >
        {excluded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        {filter.regex && <span className="rounded bg-current/10 px-0.5 font-mono text-[9px] font-bold opacity-70" title="Expressão regular">.*</span>}
        {filter.caseSensitive && <span className="rounded bg-current/10 px-0.5 font-mono text-[9px] font-bold opacity-70" title="Diferencia maiúsculas e minúsculas">Aa</span>}
        <span className="font-mono">{filter.text}</span>
      </button>
      <button
        type="button"
        onClick={() => filters.removeSearchFilter(filter.id)}
        title="Remover filtro"
        aria-label={`Remover filtro ${filter.text}`}
        className="cursor-pointer py-0.5 pl-0.5 pr-2 opacity-50 transition-opacity hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function ClearableChip({ className, onClear, children }: Readonly<{ className: string; onClear: () => void; children: React.ReactNode }>) {
  return (
    <button type="button" onClick={onClear} className={`group flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium ${className}`}>
      {children}
      <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
    </button>
  );
}

/**
 * The active filters as chips: included terms grouped in E blocks joined by OU, the excluded ones,
 * level, period, limit and the enabled highlight rules.
 */
export function FilterChips({ filters, highlightRules }: Readonly<FilterChipsProps>) {
  const { includeBlocks, excludeFilters, levelFilter, hasTimeRange, timeFrom, timeTo, lineLimit, customLineLimit, lineLimitDirection, hasActiveFilters } = filters;
  const enabledRules = highlightRules.filter((rule) => rule.enabled);
  if (!hasActiveFilters && enabledRules.length === 0) return null;
  const limitCount = lineLimit === 'custom' ? customLineLimit : lineLimit;

  return (
    <div className="flex min-h-10 items-center gap-1.5 overflow-x-auto border-b border-slate-200 px-3 py-1.5 text-[11px] dark:border-slate-800">
      {includeBlocks.map((block, blockIndex) => {
        const chips = block.map((filter, termIndex) => (
          <React.Fragment key={filter.id}>
            {termIndex > 0 && <Connector operator="and" onToggle={() => filters.toggleConnector(filter.id)} />}
            <TermChip filter={filter} filters={filters} />
          </React.Fragment>
        ));
        return (
          <React.Fragment key={block[0].id}>
            {blockIndex > 0 && <Connector operator="or" onToggle={() => filters.toggleConnector(block[0].id)} />}
            {includeBlocks.length > 1 && block.length > 1 ? (
              <span
                className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 px-1 py-0.5 dark:border-violet-800 dark:bg-violet-950/20"
                title="Bloco E: o registro precisa conter todos estes termos"
              >
                {chips}
              </span>
            ) : (
              chips
            )}
          </React.Fragment>
        );
      })}
      {excludeFilters.map((filter, index) => (
        <React.Fragment key={filter.id}>
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {index > 0 ? 'nem' : includeBlocks.length > 0 ? 'e não' : 'sem'}
          </span>
          <TermChip filter={filter} filters={filters} />
        </React.Fragment>
      ))}
      {levelFilter !== 'ALL' && (
        <ClearableChip onClear={() => filters.setLevelFilter('ALL')} className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300">
          Nível: {LEVEL_OPTIONS.find((option) => option.value === levelFilter)?.label}
        </ClearableChip>
      )}
      {hasTimeRange && (
        <ClearableChip onClear={() => filters.setTimeRange(undefined, undefined)} className="border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/40 dark:text-teal-300">
          Período: {describeTimeRange(timeFrom, timeTo)}
        </ClearableChip>
      )}
      {lineLimit !== 'ALL' && (
        <ClearableChip onClear={() => filters.setLineLimit('ALL')} className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300">
          {lineLimitDirection === 'tail' ? 'Últimos' : 'Primeiros'} {Number(limitCount).toLocaleString('pt-BR')} registros
        </ClearableChip>
      )}
      {enabledRules.map((rule) => (
        <span key={rule.id} className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: rule.color }} />
          <span className="font-mono">{rule.text}</span>
        </span>
      ))}
      {hasActiveFilters && (
        <button type="button" onClick={filters.clearAllFilters} className="ml-auto shrink-0 rounded px-1.5 py-0.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800">
          Limpar filtros
        </button>
      )}
    </div>
  );
}
