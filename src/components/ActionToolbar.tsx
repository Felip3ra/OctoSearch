import { ArrowDown, BarChart3, Bookmark, Check, Copy, Highlighter, ListOrdered, RefreshCw, Settings, WrapText } from 'lucide-react';
import { LogLevel } from '../types';
import { LevelCounts } from '../services/logView';
import { ExportFormat } from '../services/logExport';
import { capabilities } from '../services/platform';
import { ExportMenu } from './ExportMenu';
import { activeButtonClass, LEVEL_OPTIONS, neutralButtonClass, toolbarButtonClass } from './toolbarStyles';

interface ActionToolbarProps {
  levelFilter: LogLevel;
  levelCounts: LevelCounts;
  onLevelChange: (level: LogLevel) => void;
  hasTab: boolean;
  savedFiltersCount: number;
  onOpenSavedFilters: () => void;
  enabledHighlightCount: number;
  onOpenHighlightRules: () => void;
  showTimeline: boolean;
  onToggleTimeline: () => void;
  hasEntries: boolean;
  onOpenErrorGroups: () => void;
  wordWrap: boolean;
  onToggleWordWrap: () => void;
  isLiveTailing: boolean;
  /** Live view is on and the selection has disk files to watch. */
  isWatching: boolean;
  onToggleLiveTailing: () => void;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  isLoading: boolean;
  canReload: boolean;
  isMergedView: boolean;
  onReload: () => void;
  visibleCount: number;
  copied: boolean;
  onCopy: () => void;
  onExport: (format: ExportFormat) => Promise<boolean>;
  onOpenSettings: () => void;
}

function liveTitle(isLiveTailing: boolean): string {
  if (!capabilities.watchesFiles) return 'Tempo real disponível apenas no aplicativo desktop';
  return isLiveTailing ? 'Tempo real ativo: os arquivos selecionados são recarregados quando mudam no disco' : 'Ativar acompanhamento em tempo real';
}

/** Second toolbar row: level filter with counts, and the tools (saved filters, timeline, live view, export…). */
export function ActionToolbar(props: Readonly<ActionToolbarProps>) {
  const { levelFilter, levelCounts, isWatching, isLiveTailing, autoScroll, wordWrap, showTimeline } = props;
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain">
      <div role="radiogroup" aria-label="Filtrar por nível" className="flex shrink-0 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
        {LEVEL_OPTIONS.map((option) => {
          const isActive = levelFilter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => props.onLevelChange(option.value)}
              className={`flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-[11px] font-semibold transition-colors ${
                isActive
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-50'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {option.dot && <span className={`h-1.5 w-1.5 rounded-full ${option.dot}`} />}
              {option.label}
              <span className="font-normal tabular-nums text-slate-400 dark:text-slate-500">{levelCounts[option.value].toLocaleString('pt-BR')}</span>
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex min-w-max items-center gap-0.5">
        <button
          type="button"
          onClick={props.onOpenSavedFilters}
          disabled={!props.hasTab}
          title="Salvar os filtros atuais ou aplicar um filtro salvo"
          className={`${toolbarButtonClass} ${neutralButtonClass}`}
        >
          <Bookmark className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Filtros salvos</span>
          {props.savedFiltersCount > 0 && (
            <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">{props.savedFiltersCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={props.onOpenHighlightRules}
          title="Configurar marcadores que destacam linhas por texto"
          className={`${toolbarButtonClass} ${props.enabledHighlightCount > 0 ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40' : neutralButtonClass}`}
        >
          <Highlighter className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Marcadores</span>
          {props.enabledHighlightCount > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{props.enabledHighlightCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={props.onToggleTimeline}
          aria-pressed={showTimeline}
          title="Mostrar ou esconder a linha do tempo (registros por período)"
          className={`${toolbarButtonClass} ${showTimeline ? activeButtonClass : neutralButtonClass}`}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Linha do tempo</span>
        </button>

        <button
          type="button"
          onClick={props.onOpenErrorGroups}
          disabled={!props.hasEntries}
          title="Erros agrupados por mensagem, do mais frequente ao menos"
          className={`${toolbarButtonClass} ${neutralButtonClass}`}
        >
          <ListOrdered className="h-3.5 w-3.5 text-rose-500" />
          <span className="hidden xl:inline">Top erros</span>
        </button>

        <button
          type="button"
          onClick={props.onToggleWordWrap}
          title="Alternar quebra de linha (Ctrl+Shift+W)"
          aria-pressed={wordWrap}
          className={`${toolbarButtonClass} ${wordWrap ? activeButtonClass : neutralButtonClass}`}
        >
          <WrapText className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Quebrar linhas</span>
        </button>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <button
          type="button"
          onClick={props.onToggleLiveTailing}
          disabled={!capabilities.watchesFiles}
          title={liveTitle(isLiveTailing)}
          className={`${toolbarButtonClass} ${
            isWatching ? 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40' : neutralButtonClass
          }`}
        >
          <span className="relative flex h-2 w-2">
            {isWatching && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${isWatching ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </span>
          <span>Tempo real</span>
        </button>

        {isWatching && (
          <button
            type="button"
            onClick={props.onToggleAutoScroll}
            aria-pressed={autoScroll}
            title={autoScroll ? 'Auto-rolagem ativa: acompanha a última linha' : 'Auto-rolagem pausada: mantém sua posição'}
            className={`${toolbarButtonClass} ${autoScroll ? activeButtonClass : neutralButtonClass}`}
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Auto-rolar</span>
          </button>
        )}

        <button
          type="button"
          onClick={props.onReload}
          title={props.isMergedView ? 'Recarregar os arquivos selecionados' : 'Recarregar arquivo'}
          disabled={props.isLoading || !props.canReload}
          className={`${toolbarButtonClass} ${neutralButtonClass} px-2`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${props.isLoading ? 'animate-spin' : ''}`} />
        </button>

        <button
          type="button"
          onClick={props.onCopy}
          title="Copiar registros visíveis para a área de transferência"
          disabled={props.visibleCount === 0}
          className={`${toolbarButtonClass} ${neutralButtonClass}`}
        >
          {props.copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="hidden lg:inline">{props.copied ? 'Copiado!' : 'Copiar'}</span>
        </button>

        <ExportMenu
          disabled={props.visibleCount === 0}
          count={props.visibleCount}
          buttonClassName={toolbarButtonClass}
          neutralClassName={neutralButtonClass}
          onExport={props.onExport}
        />

        <button type="button" onClick={props.onOpenSettings} title="Configurações (Ctrl+,)" className={`${toolbarButtonClass} ${neutralButtonClass} px-2`}>
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
