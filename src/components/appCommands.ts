import {
  AlignJustify, ArrowDown, ArrowUp, BarChart3, Bookmark, CalendarClock, Copy, Download, Eraser, Filter, Folder, FolderOpen,
  Hash, Highlighter, ListOrdered, Moon, PanelLeft, PanelRight, Pin, RefreshCw, Settings, WrapText,
} from 'lucide-react';
import { FolderTab, LogLevel, SavedFilter, SavedFolder } from '../types';
import { ExportFormat } from '../services/logExport';
import { Command } from './CommandPalette';
import { QUICK_RANGES, quickRangeStart } from './TimeRangeFilter';
import { LEVEL_OPTIONS } from './toolbarStyles';
import { ViewerCommand } from './VirtualLogViewer';

export interface CommandContext {
  hasTab: boolean;
  hasEntries: boolean;
  tabs: FolderTab[];
  savedFolders: SavedFolder[];
  savedFilters: SavedFilter[];
  latestEntryTime?: number;
  canWatchFiles: boolean;
  openFolder: () => void;
  selectTab: (id: string) => void;
  openSavedFolder: (path: string, name: string) => void;
  applySavedFilter: (filter: SavedFilter) => void;
  setLevel: (level: LogLevel) => void;
  setTimeRange: (from: number | undefined, to: number | undefined) => void;
  clearFilters: () => void;
  viewer: (command: ViewerCommand) => void;
  toggleTimeline: () => void;
  openErrorGroups: () => void;
  toggleDetails: () => void;
  toggleFileList: () => void;
  toggleWordWrap: () => void;
  toggleCompact: () => void;
  toggleTheme: () => void;
  toggleLiveTailing: () => void;
  reload: () => void;
  copyVisible: () => void;
  exportAs: (format: ExportFormat) => void;
  openSavedFilters: () => void;
  openHighlightRules: () => void;
  openSettings: () => void;
}

/** Everything the command palette (Ctrl+K) can do, in the order it is listed with an empty search. */
export function buildCommands(context: CommandContext): Command[] {
  const commands: Command[] = [];
  const add = (command: Command, available = true) => {
    if (available) commands.push(command);
  };
  const { hasTab, hasEntries } = context;

  add({ id: 'next-error', group: 'Navegar', label: 'Próximo erro (ERR)', icon: ArrowDown, shortcut: 'F8', run: () => context.viewer('nextError') }, hasEntries);
  add({ id: 'previous-error', group: 'Navegar', label: 'Erro anterior (ERR)', icon: ArrowUp, shortcut: 'Shift+F8', run: () => context.viewer('previousError') }, hasEntries);
  add({ id: 'go-to-line', group: 'Navegar', label: 'Ir para a linha…', icon: Hash, shortcut: 'Ctrl+G', keywords: 'linha numero', run: () => context.viewer('goToLine') }, hasEntries);
  add({ id: 'next-bookmark', group: 'Navegar', label: 'Próximo registro marcado', icon: Pin, shortcut: 'F2', keywords: 'marcador alfinete', run: () => context.viewer('nextBookmark') }, hasEntries);
  add({ id: 'previous-bookmark', group: 'Navegar', label: 'Registro marcado anterior', icon: Pin, shortcut: 'Shift+F2', keywords: 'marcador alfinete', run: () => context.viewer('previousBookmark') }, hasEntries);

  add({ id: 'top-errors', group: 'Analisar', label: 'Top erros', icon: ListOrdered, keywords: 'agrupar erros frequentes', run: context.openErrorGroups }, hasEntries);
  add({ id: 'timeline', group: 'Analisar', label: 'Mostrar ou esconder a linha do tempo', icon: BarChart3, keywords: 'grafico histograma', run: context.toggleTimeline });
  add({ id: 'details', group: 'Analisar', label: 'Painel de detalhes do registro', icon: PanelRight, shortcut: 'Enter', keywords: 'campos json', run: context.toggleDetails });

  for (const option of LEVEL_OPTIONS) {
    add({ id: `level-${option.value}`, group: 'Filtrar', label: option.value === 'ALL' ? 'Mostrar todos os níveis' : `Mostrar só ${option.label}`, icon: Filter, keywords: 'nivel', run: () => context.setLevel(option.value) }, hasTab);
  }
  for (const range of QUICK_RANGES) {
    add({ id: `range-${range.minutes}`, group: 'Filtrar', label: `Período: últimos ${range.label}`, icon: CalendarClock, keywords: 'periodo tempo', run: () => context.setTimeRange(quickRangeStart(context.latestEntryTime, range.minutes), undefined) }, hasTab);
  }
  add({ id: 'clear-filters', group: 'Filtrar', label: 'Limpar filtros', icon: Eraser, run: context.clearFilters }, hasTab);
  add({ id: 'saved-filters', group: 'Filtrar', label: 'Filtros salvos…', icon: Bookmark, run: context.openSavedFilters }, hasTab);
  for (const filter of context.savedFilters) {
    add({ id: `saved-filter-${filter.id}`, group: 'Filtros salvos', label: `Aplicar filtro: ${filter.name}`, icon: Bookmark, keywords: filter.group, run: () => context.applySavedFilter(filter) }, hasTab);
  }

  add({ id: 'open-folder', group: 'Pastas', label: 'Abrir pasta…', icon: FolderOpen, run: context.openFolder });
  for (const tab of context.tabs) {
    add({ id: `tab-${tab.id}`, group: 'Abas', label: `Ir para a aba ${tab.folderName}`, icon: Folder, keywords: tab.folderPath, run: () => context.selectTab(tab.id) });
  }
  for (const folder of context.savedFolders) {
    add({ id: `saved-folder-${folder.id}`, group: 'Pastas salvas', label: `Abrir ${folder.name}`, icon: Folder, keywords: folder.path, run: () => context.openSavedFolder(folder.path, folder.name) });
  }

  add({ id: 'live', group: 'Ações', label: 'Ligar ou desligar o tempo real', icon: RefreshCw, run: context.toggleLiveTailing }, context.canWatchFiles);
  add({ id: 'reload', group: 'Ações', label: 'Recarregar arquivos', icon: RefreshCw, run: context.reload }, hasTab);
  add({ id: 'copy', group: 'Ações', label: 'Copiar registros visíveis', icon: Copy, run: context.copyVisible }, hasEntries);
  add({ id: 'export-log', group: 'Ações', label: 'Exportar para texto (.log)', icon: Download, run: () => context.exportAs('log') }, hasEntries);
  add({ id: 'export-csv', group: 'Ações', label: 'Exportar para planilha (.csv)', icon: Download, keywords: 'excel', run: () => context.exportAs('csv') }, hasEntries);

  add({ id: 'file-list', group: 'Exibição', label: 'Mostrar ou recolher a lista de arquivos', icon: PanelLeft, run: context.toggleFileList });
  add({ id: 'word-wrap', group: 'Exibição', label: 'Quebrar linhas', icon: WrapText, shortcut: 'Ctrl+Shift+W', run: context.toggleWordWrap });
  add({ id: 'compact', group: 'Exibição', label: 'Densidade compacta', icon: AlignJustify, keywords: 'linhas menores', run: context.toggleCompact });
  add({ id: 'theme', group: 'Exibição', label: 'Alternar tema claro/escuro', icon: Moon, run: context.toggleTheme });
  add({ id: 'highlight-rules', group: 'Exibição', label: 'Marcadores coloridos…', icon: Highlighter, run: context.openHighlightRules });
  add({ id: 'settings', group: 'Exibição', label: 'Configurações', icon: Settings, shortcut: 'Ctrl+,', run: context.openSettings });
  return commands;
}
