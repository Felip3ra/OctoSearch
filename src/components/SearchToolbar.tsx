import { CaseSensitive, Minus, Plus, Regex, Search, X } from 'lucide-react';
import { looksLikeFieldFilter } from '../services/logFields';
import { MAX_CUSTOM_LINE_LIMIT, TabFilters } from '../hooks/useTabFilters';
import { TimeRangeFilter } from './TimeRangeFilter';
import { activeButtonClass, neutralButtonClass, toolbarButtonClass } from './toolbarStyles';

interface SearchToolbarProps {
  filters: TabFilters;
  disabled: boolean;
  latestEntryTime?: number;
}

const SEARCH_HINT =
  'Texto ou expressão regular. Para filtrar por campo (JSON ou chave=valor): $campo = valor, $Elapsed > 1000, $RequestPath ~ /api';

/** First toolbar row: the search box with its options, the period and the record limit. */
export function SearchToolbar({ filters, disabled, latestEntryTime }: Readonly<SearchToolbarProps>) {
  const {
    searchTerm, searchRegex, searchCaseSensitive, searchPatternError,
    timeFrom, timeTo, lineLimit, customLineLimit, lineLimitDirection,
  } = filters;
  const cannotAdd = !searchTerm.trim() || Boolean(searchPatternError);
  let searchTitle = SEARCH_HINT;
  if (searchPatternError) searchTitle = looksLikeFieldFilter(searchTerm) ? searchPatternError : `Expressão regular inválida: ${searchPatternError}`;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:min-w-[320px]">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="search-log-input"
            type="text"
            value={searchTerm}
            onChange={(event) => filters.setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                filters.addSearchFilter(event.shiftKey ? 'exclude' : 'include');
              }
            }}
            disabled={disabled}
            placeholder={searchRegex ? 'Expressão regular…  Enter inclui · Shift+Enter exclui' : 'Buscar nos logs…  Enter inclui · Shift+Enter exclui'}
            aria-invalid={Boolean(searchPatternError)}
            title={searchTitle}
            className={`h-8 w-full rounded-md border bg-slate-50 pl-9 pr-8 ${searchPatternError ? 'border-rose-400 dark:border-rose-700' : 'border-slate-200 dark:border-slate-700'} font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950`}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => filters.setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Limpar pesquisa (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex h-8 shrink-0 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={filters.toggleSearchCaseSensitive}
            disabled={disabled}
            aria-pressed={searchCaseSensitive}
            title={searchCaseSensitive ? 'Diferenciando maiúsculas e minúsculas no próximo termo' : 'Diferenciar maiúsculas e minúsculas no próximo termo'}
            className={`flex w-8 cursor-pointer items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${searchCaseSensitive ? activeButtonClass : neutralButtonClass}`}
          >
            <CaseSensitive className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={filters.toggleSearchRegex}
            disabled={disabled}
            aria-pressed={searchRegex}
            title={searchRegex ? 'O próximo termo será tratado como expressão regular' : 'Tratar o próximo termo como expressão regular'}
            className={`flex w-8 cursor-pointer items-center justify-center border-l border-slate-200 transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 ${searchRegex ? activeButtonClass : neutralButtonClass}`}
          >
            <Regex className="h-4 w-4" />
          </button>
        </div>
        <div className="flex h-8 shrink-0 overflow-hidden rounded-md border border-slate-200 text-[11px] font-semibold dark:border-slate-700">
          <button
            type="button"
            onClick={() => filters.addSearchFilter('include')}
            disabled={cannotAdd}
            title="Mostrar registros que contêm este texto. Clique no conector entre os termos para alternar entre OU e E (E agrupa primeiro) (Enter)"
            className="flex items-center gap-1 px-2.5 text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
          >
            <Plus className="h-3.5 w-3.5" /> Incluir
          </button>
          <button
            type="button"
            onClick={() => filters.addSearchFilter('exclude')}
            disabled={cannotAdd}
            title="Ocultar registros que contêm este texto, além dos filtros de inclusão (Shift+Enter)"
            className="flex items-center gap-1 border-l border-slate-200 px-2.5 text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/50"
          >
            <Minus className="h-3.5 w-3.5" /> Excluir
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <TimeRangeFilter
          timeFrom={timeFrom}
          timeTo={timeTo}
          latestTime={latestEntryTime}
          disabled={disabled}
          buttonClassName={`${toolbarButtonClass} border border-slate-200 dark:border-slate-700`}
          activeClassName={activeButtonClass}
          neutralClassName={neutralButtonClass}
          onChange={filters.setTimeRange}
        />
        <select
          id="select-line-limit"
          value={lineLimit}
          onChange={(event) => filters.setLineLimit(event.target.value)}
          title="Limitar a quantidade de registros exibidos (um registro inclui sua stack trace)"
          className="h-8 cursor-pointer rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          <option value="ALL">Todos os registros</option>
          <option value="50">50 registros</option>
          <option value="100">100 registros</option>
          <option value="500">500 registros</option>
          <option value="1000">1.000 registros</option>
          <option value="5000">5.000 registros</option>
          <option value="custom">Personalizado…</option>
        </select>
        {lineLimit === 'custom' && (
          <input
            type="number"
            min={1}
            max={MAX_CUSTOM_LINE_LIMIT}
            value={customLineLimit}
            onChange={(event) => filters.setCustomLineLimit(Number.parseInt(event.target.value, 10) || 1)}
            className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 font-mono text-xs text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            aria-label="Quantidade de registros"
          />
        )}
        {lineLimit !== 'ALL' && (
          <div className="flex h-8 shrink-0 rounded-md bg-slate-100 p-0.5 text-[11px] font-medium dark:bg-slate-800">
            {(['tail', 'head'] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                onClick={() => filters.setLineLimitDirection(direction)}
                title={direction === 'tail' ? 'Mostrar os registros mais recentes (fim do log)' : 'Mostrar os primeiros registros (início do log)'}
                className={`cursor-pointer rounded px-2 transition-colors ${
                  lineLimitDirection === direction
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {direction === 'tail' ? 'Últimos' : 'Primeiros'}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
