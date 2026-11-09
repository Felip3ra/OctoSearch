import { useCallback, useMemo, useState } from 'react';
import { AlignJustify, Bookmark, FolderOpen, Highlighter, PanelLeftOpen, PanelRight, WrapText } from 'lucide-react';
import { LogEntry, LogFileItem, SavedFilter } from './types';
import { getSourceColor } from './services/logMerge';
import { buildExport, ExportFormat, exportFileName, saveExport } from './services/logExport';
import { capabilities } from './services/platform';
import { getSavedFilters, persistSavedFilters } from './services/filterStorage';
import { useLogLoader, MAX_INITIAL_READ_BYTES } from './hooks/useLogLoader';
import { useLiveNotifications } from './hooks/useLiveNotifications';
import { usePreferences } from './hooks/usePreferences';
import { useSavedFolders } from './hooks/useSavedFolders';
import { useTabs } from './hooks/useTabs';
import { useFolderOpening } from './hooks/useFolderOpening';
import { useTabFilters } from './hooks/useTabFilters';
import { useFilteredEntries } from './hooks/useFilteredEntries';
import { useBookmarks } from './hooks/useBookmarks';
import { useFileDrop } from './hooks/useFileDrop';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import { buildSourceLabels, isNativeFile } from './utils/logFile';
import { FolderTabs } from './components/FolderTabs';
import { FileList } from './components/FileList';
import { VirtualLogViewer } from './components/VirtualLogViewer';
import { StatusBar } from './components/StatusBar';
import { DesktopModal } from './components/DesktopModal';
import { SavedFoldersModal } from './components/SavedFoldersModal';
import { HighlightRulesModal } from './components/HighlightRulesModal';
import { SettingsModal } from './components/SettingsModal';
import { SavedFiltersModal } from './components/SavedFiltersModal';
import { TimelineHistogram } from './components/TimelineHistogram';
import { ErrorGroupsPanel } from './components/ErrorGroupsPanel';
import { SearchToolbar } from './components/SearchToolbar';
import { ActionToolbar } from './components/ActionToolbar';
import { FilterChips } from './components/FilterChips';
import { ViewerHeader } from './components/ViewerHeader';
import { DeniedFoldersNotice, Notice } from './components/Notice';
import { RecordDetailsPanel } from './components/RecordDetailsPanel';
import { PanelResizer } from './components/PanelResizer';
import { CommandPalette } from './components/CommandPalette';
import { buildCommands } from './components/appCommands';
import { ViewerCommand } from './components/VirtualLogViewer';
import { FILE_LIST_WIDTH } from './hooks/usePreferences';

type OpenPanel = 'settings' | 'savedFilters' | 'savedFolders' | 'highlightRules' | 'errorGroups' | 'desktop' | 'palette' | null;

/**
 * Composition of the app: state lives in hooks (tabs, folders, filters, preferences, loading) and
 * the screen is made of components that receive what they show and the actions they trigger.
 */
export default function App() {
  const preferences = usePreferences();
  const folders = useSavedFolders();
  const tabs = useTabs({ savedFolders: folders.savedFolders, recordFolder: folders.recordFolder });
  const { activeTab, selectedFiles } = tabs;
  const isMergedView = selectedFiles.length > 1;

  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const closePanel = useCallback(() => setOpenPanel(null), []);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => getSavedFilters());
  /** Messages that used to be alert() boxes: shown as a dismissible notice under the tabs. */
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  /** Request for the viewer to scroll to a record (a new nonce repeats it). */
  const [navigateTo, setNavigateTo] = useState<{ entryId: number; nonce: number } | null>(null);
  /** Keyboard actions of the list asked from elsewhere (command palette). */
  const [viewerCommand, setViewerCommand] = useState<{ type: ViewerCommand; nonce: number } | null>(null);
  const [activeEntry, setActiveEntry] = useState<LogEntry | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isLiveTailing, setIsLiveTailing] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const isWatching = isLiveTailing && capabilities.watchesFiles && selectedFiles.some(isNativeFile);

  const loader = useLogLoader(selectedFiles, isLiveTailing);
  const { entries, isLoading, setIsLoading, setLoadingProgress } = loader;
  useLiveNotifications(entries, loader.lastLiveUpdate, { errors: preferences.notifyErrors, terms: preferences.notifyTerms });

  const opening = useFolderOpening({
    tabs: tabs.tabs,
    activeTab,
    savedFolders: folders.savedFolders,
    openFolderInTab: tabs.openFolderInTab,
    addRestoredTabs: tabs.addRestoredTabs,
    setActiveTabId: tabs.setActiveTabId,
    setIsLoading,
    setLoadingProgress,
    notify: setAppNotice,
  });

  const filters = useTabFilters(activeTab, tabs.updateActiveTab);
  const { filteredEntries, histogram, levelCounts, latestEntryTime } = useFilteredEntries(entries, filters, preferences.showTimeline);
  const { bookmarkedKeys, toggleBookmark } = useBookmarks(selectedFiles);
  const { isDraggingOver, dropHandlers } = useFileDrop(tabs.openFolderInTab, setAppNotice);

  const sourceInfo = useMemo(() => {
    const labels = buildSourceLabels(selectedFiles);
    const colorById = new Map<string, string>();
    const colorByLabel = new Map<string, string>();
    selectedFiles.forEach((file, index) => {
      const color = getSourceColor(index);
      colorById.set(file.id, color);
      colorByLabel.set(labels.get(file.id) || file.name, color);
    });
    return { labels, colorById, colorByLabel };
  }, [selectedFiles]);

  const { setWordWrap } = preferences;
  const { searchTerm, setSearchTerm } = filters;
  useAppShortcuts({
    onToggleWordWrap: useCallback(() => setWordWrap((current) => !current), [setWordWrap]),
    onOpenSettings: useCallback(() => setOpenPanel('settings'), []),
    onOpenPalette: useCallback(() => setOpenPanel('palette'), []),
    onEscape: () => {
      if (openPanel === 'settings') setOpenPanel(null);
      else if (openPanel) return; // the other dialogs close themselves on Escape
      else if (searchTerm) setSearchTerm('');
      else if (isDetailsOpen) setIsDetailsOpen(false);
    },
  });

  const runViewerCommand = (type: ViewerCommand) => setViewerCommand((previous) => ({ type, nonce: (previous?.nonce ?? 0) + 1 }));
  const openDetails = useCallback(() => setIsDetailsOpen(true), []);

  const handleSavedFiltersChange = (next: SavedFilter[]) => {
    setSavedFilters(next);
    persistSavedFilters(next);
  };

  const handleCopyVisible = async () => {
    if (filteredEntries.length === 0) return;
    try {
      await navigator.clipboard.writeText(buildExport(filteredEntries, 'log', isMergedView));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // Clipboard can be unavailable without user permission.
    }
  };

  const handleExport = (format: ExportFormat) => {
    const baseName = isMergedView ? activeTab?.folderName || 'logs' : selectedFiles[0]?.name || 'logs';
    return saveExport(exportFileName(baseName, format), buildExport(filteredEntries, format, isMergedView));
  };

  const statusFile: LogFileItem | null = isMergedView
    ? {
        id: 'merged',
        name: `${selectedFiles.length} arquivos selecionados`,
        path: activeTab?.folderPath || '',
        size: selectedFiles.reduce((total, file) => total + file.size, 0),
        lastModified: Math.max(0, ...selectedFiles.map((file) => file.lastModified)),
      }
    : selectedFiles[0] || null;

  const toggleFileList = () => preferences.setFileListCollapsed((current) => !current);
  const toggleCompact = () => preferences.setCompact((current) => !current);
  const moreItems = [
    { label: 'Filtros salvos', icon: Bookmark, badge: savedFilters.length, disabled: !activeTab, onSelect: () => setOpenPanel('savedFilters') },
    {
      label: 'Marcadores coloridos',
      icon: Highlighter,
      badge: preferences.highlightRules.filter((rule) => rule.enabled).length,
      onSelect: () => setOpenPanel('highlightRules'),
    },
    { label: 'Painel de detalhes', icon: PanelRight, checked: isDetailsOpen, shortcut: 'Enter', onSelect: () => setIsDetailsOpen((current) => !current) },
    { label: 'Quebrar linhas', icon: WrapText, checked: preferences.wordWrap, shortcut: 'Ctrl+Shift+W', onSelect: () => setWordWrap((current) => !current) },
    { label: 'Densidade compacta', icon: AlignJustify, checked: preferences.compact, onSelect: toggleCompact },
    { label: 'Lista de arquivos', icon: PanelLeftOpen, checked: !preferences.fileListCollapsed, onSelect: toggleFileList },
  ];

  const commands =
    openPanel === 'palette'
      ? buildCommands({
          hasTab: Boolean(activeTab),
          hasEntries: filteredEntries.length > 0,
          tabs: tabs.tabs,
          savedFolders: folders.savedFolders,
          savedFilters,
          latestEntryTime,
          canWatchFiles: capabilities.watchesFiles,
          // One implementation for both the desktop and the browser folder pickers: the button's.
          openFolder: () => document.getElementById('btn-select-folder')?.click(),
          selectTab: tabs.setActiveTabId,
          openSavedFolder: (path, name) => void opening.openSavedFolder(path, name),
          applySavedFilter: filters.applySavedFilter,
          setLevel: filters.setLevelFilter,
          setTimeRange: filters.setTimeRange,
          clearFilters: filters.clearAllFilters,
          viewer: runViewerCommand,
          toggleTimeline: () => preferences.setShowTimeline((current) => !current),
          openErrorGroups: () => setOpenPanel('errorGroups'),
          toggleDetails: () => setIsDetailsOpen((current) => !current),
          toggleFileList,
          toggleWordWrap: () => setWordWrap((current) => !current),
          toggleCompact,
          toggleTheme: () => preferences.setIsDarkMode((current) => !current),
          toggleLiveTailing: () => setIsLiveTailing((current) => !current),
          reload: loader.reload,
          copyVisible: () => void handleCopyVisible(),
          exportAs: (format) => void handleExport(format),
          openSavedFilters: () => setOpenPanel('savedFilters'),
          openHighlightRules: () => setOpenPanel('highlightRules'),
          openSettings: () => setOpenPanel('settings'),
        })
      : [];

  let emptyTitle = 'Nenhum registro encontrado';
  let emptyDescription = filters.hasActiveFilters ? 'Nenhum registro corresponde aos filtros aplicados.' : 'O arquivo selecionado está vazio.';
  if (!activeTab) {
    emptyTitle = 'Abra uma pasta de logs';
    emptyDescription = 'Use “Abrir pasta”, escolha uma pasta salva ou arraste arquivos .log/.txt para esta janela.';
  } else if (selectedFiles.length === 0) {
    emptyTitle = 'Nenhum arquivo selecionado';
    emptyDescription = 'Marque um ou mais arquivos no painel lateral. Vários arquivos são exibidos juntos em ordem cronológica.';
  }

  return (
    <div
      id="app-container"
      {...dropHandlers}
      className="relative flex h-screen h-dvh w-full max-w-full select-none flex-col overflow-hidden bg-slate-100 font-sans text-slate-800 dark:bg-slate-950 dark:text-slate-100"
    >
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-sky-500/10 p-6 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-sky-500 bg-white/95 px-10 py-8 text-center shadow-2xl dark:bg-slate-900/95">
            <FolderOpen className="mx-auto mb-3 h-8 w-8 text-sky-500" />
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Solte a pasta ou os arquivos aqui</p>
            <p className="mt-1 text-xs text-slate-500">Uma nova aba será aberta com os arquivos importados</p>
          </div>
        </div>
      )}

      <FolderTabs
        tabs={tabs.tabs}
        activeTabId={activeTab?.id || ''}
        onSelectTab={tabs.setActiveTabId}
        onCloseTab={tabs.closeTab}
        onOpenNewFolder={tabs.openFolderInTab}
        onRenameFolder={tabs.renameTab}
        onOpenDesktopModal={() => setOpenPanel('desktop')}
        savedFolders={folders.savedFolders}
        onOpenSavedFolder={opening.openSavedFolder}
        onToggleFavoriteFolder={folders.toggleFavorite}
        onToggleActiveFavorite={() => activeTab && folders.toggleFavoriteByPath(activeTab.folderPath, activeTab.folderName, activeTab.files.length)}
        onOpenSavedFoldersModal={() => setOpenPanel('savedFolders')}
        isDarkMode={preferences.isDarkMode}
        onToggleTheme={() => preferences.setIsDarkMode((current) => !current)}
        onOpenSettings={() => setOpenPanel('settings')}
      />

      <DeniedFoldersNotice
        folders={opening.deniedFolders}
        onAllow={(folder) => void opening.openSavedFolder(folder.path, folder.name)}
        onDismiss={opening.dismissDeniedFolders}
      />
      {appNotice && (
        <Notice tone="error" onDismiss={() => setAppNotice(null)}>
          {appNotice}
        </Notice>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        {preferences.fileListCollapsed ? (
          <button
            type="button"
            onClick={toggleFileList}
            title="Mostrar a lista de arquivos"
            aria-label="Mostrar a lista de arquivos"
            className="flex w-full shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:w-9 md:flex-col md:border-b-0 md:border-r md:px-0 md:py-3 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <PanelLeftOpen className="h-4 w-4 shrink-0 rotate-90 md:rotate-0" />
            <span className="font-semibold md:hidden">Arquivos</span>
            <span className="text-[10px] font-semibold tabular-nums">{activeTab?.files.length ?? 0}</span>
          </button>
        ) : (
          <>
            <FileList
              files={activeTab?.files ?? []}
              rootPath={activeTab?.folderPath || ''}
              selectedFileIds={activeTab?.selectedFileIds ?? []}
              onSelectionChange={tabs.setSelection}
              sourceColors={sourceInfo.colorById}
              sortField={preferences.fileSortField}
              sortDirection={preferences.sortDirection}
              onOpenSortSettings={() => setOpenPanel('settings')}
              width={preferences.fileListWidth}
              onCollapse={toggleFileList}
            />
            <PanelResizer
              label="Largura da lista de arquivos"
              width={preferences.fileListWidth}
              min={FILE_LIST_WIDTH.min}
              max={FILE_LIST_WIDTH.max}
              initial={FILE_LIST_WIDTH.initial}
              onChange={preferences.setFileListWidth}
            />
          </>
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-white dark:bg-slate-900">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
            <SearchToolbar filters={filters} disabled={!activeTab} latestEntryTime={latestEntryTime} />
            <ActionToolbar
              levelFilter={filters.levelFilter}
              levelCounts={levelCounts}
              onLevelChange={filters.setLevelFilter}
              showTimeline={preferences.showTimeline}
              onToggleTimeline={() => preferences.setShowTimeline((current) => !current)}
              hasEntries={entries.length > 0}
              onOpenErrorGroups={() => setOpenPanel('errorGroups')}
              isLiveTailing={isLiveTailing}
              isWatching={isWatching}
              onToggleLiveTailing={() => setIsLiveTailing((current) => !current)}
              autoScroll={autoScroll}
              onToggleAutoScroll={() => setAutoScroll((current) => !current)}
              isLoading={isLoading}
              canReload={selectedFiles.length > 0}
              isMergedView={isMergedView}
              onReload={loader.reload}
              visibleCount={filteredEntries.length}
              copied={copiedAll}
              onCopy={handleCopyVisible}
              onExport={handleExport}
              moreItems={moreItems}
              onOpenSettings={() => setOpenPanel('settings')}
            />
          </div>

          <FilterChips filters={filters} highlightRules={preferences.highlightRules} />

          <ViewerHeader
            selectedFiles={selectedFiles}
            colorById={sourceInfo.colorById}
            labels={sourceInfo.labels}
            shownCount={filteredEntries.length}
            totalCount={entries.length}
          />

          {loader.unrecognizedFiles.length > 0 && (
            <Notice tone="warning" onDismiss={loader.dismissUnrecognized}>
              Formato de log não reconhecido em <strong>{loader.unrecognizedFiles.join(', ')}</strong>. As linhas são exibidas
              uma a uma, sem data e nível{isMergedView ? ', no início da linha do tempo' : ''}.
            </Notice>
          )}
          {loader.truncatedFiles.length > 0 && (
            <Notice tone="info" onDismiss={loader.dismissTruncated}>
              <strong>{loader.truncatedFiles.join(', ')}</strong> {loader.truncatedFiles.length > 1 ? 'são maiores' : 'é maior'} que{' '}
              {Math.round(MAX_INITIAL_READ_BYTES / (1024 * 1024))} MB: exibindo só o final do arquivo (os registros mais recentes).
              Os números de linha contam a partir do trecho carregado.
            </Notice>
          )}
          {loader.errorMessage && (
            <Notice tone="error" onDismiss={() => loader.setErrorMessage(null)}>
              {loader.errorMessage}
            </Notice>
          )}

          {histogram && <TimelineHistogram histogram={histogram} timeFrom={filters.timeFrom} timeTo={filters.timeTo} onRangeChange={filters.setTimeRange} />}

          <div className="relative flex min-h-0 flex-1">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {isLoading && (
              <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-sky-500/10">
                <div className="h-full bg-sky-500 transition-[width] duration-200" style={{ width: `${loader.loadingProgress}%` }} />
              </div>
            )}
            <VirtualLogViewer
              entries={filteredEntries}
              allEntries={entries}
              searchTerms={filters.highlightTerms}
              autoScroll={isWatching && autoScroll}
              highlightRules={preferences.highlightRules}
              wordWrap={preferences.wordWrap}
              sourceColors={sourceInfo.colorByLabel}
              emptyTitle={isLoading ? 'Carregando…' : emptyTitle}
              emptyDescription={isLoading ? `Processando ${selectedFiles.length} arquivo(s)…` : emptyDescription}
              navigateTo={navigateTo}
              bookmarkedKeys={bookmarkedKeys}
              onToggleBookmark={toggleBookmark}
              compact={preferences.compact}
              onActiveEntryChange={setActiveEntry}
              onOpenDetails={openDetails}
              command={viewerCommand}
            />
          </div>
          {isDetailsOpen && (
            <RecordDetailsPanel
              entry={activeEntry}
              sourceColor={activeEntry?.sourceFile ? sourceInfo.colorByLabel.get(activeEntry.sourceFile) : undefined}
              onAddFilter={filters.addFilterTerm}
              onClose={() => setIsDetailsOpen(false)}
            />
          )}
          </div>
        </main>
      </div>

      <StatusBar
        currentFile={statusFile}
        totalLines={loader.totalLines}
        totalEntries={entries.length}
        filteredCount={filteredEntries.length}
        searchFilters={filters.searchFilters}
        levelFilter={filters.levelFilter}
        lineLimit={filters.lineLimit}
        customLineLimit={filters.customLineLimit}
        lineLimitDirection={filters.lineLimitDirection}
        isLoading={isLoading}
        loadingProgress={loader.loadingProgress}
        errorMessage={loader.errorMessage}
        isWatching={isWatching}
        autoScroll={isWatching && autoScroll}
        lastLiveUpdate={loader.lastLiveUpdate}
      />

      <DesktopModal isOpen={openPanel === 'desktop'} onClose={closePanel} />

      <SavedFoldersModal
        isOpen={openPanel === 'savedFolders'}
        onClose={closePanel}
        savedFolders={folders.savedFolders}
        currentFolderPath={activeTab?.folderPath || ''}
        onOpenFolder={opening.openSavedFolder}
        onToggleFavorite={folders.toggleFavorite}
        onRemoveFolder={folders.removeFolder}
        onAddManualFolder={folders.addManualFolder}
      />

      <SavedFiltersModal
        isOpen={openPanel === 'savedFilters'}
        savedFilters={savedFilters}
        currentFilters={filters.searchFilters}
        currentOperator={filters.includeOperator}
        currentLevel={filters.levelFilter}
        onChange={handleSavedFiltersChange}
        onApply={(saved) => {
          filters.applySavedFilter(saved);
          closePanel();
        }}
        onClose={closePanel}
      />

      <HighlightRulesModal
        isOpen={openPanel === 'highlightRules'}
        rules={preferences.highlightRules}
        onChange={preferences.setHighlightRules}
        onClose={closePanel}
      />

      <ErrorGroupsPanel
        isOpen={openPanel === 'errorGroups'}
        entries={filteredEntries}
        onFilterGroup={(pattern) => {
          filters.addFilterTerm(pattern, 'include', true);
          closePanel();
        }}
        onShowEntry={(entry) => {
          closePanel();
          setNavigateTo({ entryId: entry.id, nonce: Date.now() });
        }}
        onClose={closePanel}
      />

      <SettingsModal
        isOpen={openPanel === 'settings'}
        isDarkMode={preferences.isDarkMode}
        wordWrap={preferences.wordWrap}
        compact={preferences.compact}
        onToggleCompact={toggleCompact}
        fileSortField={preferences.fileSortField}
        sortDirection={preferences.sortDirection}
        onToggleTheme={() => preferences.setIsDarkMode((current) => !current)}
        onToggleWordWrap={() => setWordWrap((current) => !current)}
        onFileSortFieldChange={preferences.setFileSortField}
        onSortDirectionChange={preferences.setSortDirection}
        notifyErrors={preferences.notifyErrors}
        notifyTerms={preferences.notifyTerms}
        onNotifyErrorsChange={preferences.setNotifyErrors}
        onNotifyTermsChange={preferences.setNotifyTerms}
        onClose={closePanel}
      />

      <CommandPalette isOpen={openPanel === 'palette'} commands={commands} onClose={closePanel} />
    </div>
  );
}
